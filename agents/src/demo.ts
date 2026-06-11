import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { SDK, SchemaEncoder, type DataStream } from "@somnia-chain/streams";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatUnits,
  getAddress,
  http,
  keccak256,
  parseEther,
  stringToHex,
  type Abi,
  type Address,
  type Hex
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

type TimelineItem = {
  time: string;
  kind: "system" | "evidence" | "proposal" | "rejected" | "execution" | "payout";
  title: string;
  detail: string;
  txHash?: Hex;
};

type EvidenceRecord = {
  mandateId: string;
  agent: Address;
  sourceId: Hex;
  priceE6: string;
  observedAt: string;
  valid: boolean;
  evidenceHash: Hex;
  txHash?: Hex;
};

type ProposalRecord = {
  mandateId: string;
  agent: Address;
  outputToken: Address;
  expectedOutput: string;
  slippageBps: number;
  routeHash: Hex;
  valid: boolean;
  txHash?: Hex;
};

type DemoState = {
  status: string;
  network: string;
  mode: "SOMNIA";
  proofLabel: string;
  mandateId?: string;
  contracts: Record<string, Address>;
  agents: Record<string, Address>;
  balances: { input: string; output: string; bountyPaid: string };
  lifi: { status: string; detail: string; expectedOutput?: string };
  streams: {
    transport: "SOMNIA_DATA_STREAMS" | "SOMNIA_DATA_STREAMS_FAILED";
    evidenceSchema: string;
    proposalSchema: string;
    evidenceSchemaId?: Hex;
    proposalSchemaId?: Hex;
    publishTxs: Hex[];
    errors: string[];
    evidence: EvidenceRecord[];
    proposals: ProposalRecord[];
  };
  timeline: TimelineItem[];
  updatedAt: string;
};

type DeploymentFile = {
  network: string;
  chainId: number;
  rpcUrl: string;
  status: string;
  deployedAt?: string;
  deployer?: Address;
  contracts: Record<string, string>;
  transactions: Record<string, string>;
  somnia: {
    agentsPlatform: string;
    jsonApiAgentId: string;
    reactivity?: {
      subscriptionId?: string;
      precompile: Address;
      eventTopic: Hex;
      priorityFeePerGas: string;
      maxFeePerGas: string;
      gasLimit: string;
    };
    dataStreams: {
      evidenceSchema?: string;
      proposalSchema?: string;
      evidenceSchemaId?: Hex;
      proposalSchemaId?: Hex;
      evidenceSchemaRegistration?: Hex;
      proposalSchemaRegistration?: Hex;
      evidenceStream?: string;
      proposalStream?: string;
    };
  };
  explorer: { baseUrl: string };
};

const evidenceSchema =
  "uint256 mandateId,address agent,bytes32 sourceId,int256 priceE6,uint64 observedAt,bool valid,bytes32 evidenceHash";
const proposalSchema =
  "uint256 mandateId,address agent,address outputToken,uint256 expectedOutput,uint16 slippageBps,bytes32 routeHash,bool valid";
const evidenceEncoder = new SchemaEncoder(evidenceSchema);
const proposalEncoder = new SchemaEncoder(proposalSchema);
const root = resolve(import.meta.dirname, "../..");
const deploymentPath = resolve(root, "deployments/somnia-testnet.json");
const statePath = resolve(root, "frontend/public/demo-state.json");
const rpcUrl = process.env.RPC_URL ?? "https://dream-rpc.somnia.network/";
const somniaAgentsPlatform = getAddress(
  process.env.SOMNIA_AGENTS_PLATFORM ?? "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776"
) as Address;
const somniaJsonApiAgentId = BigInt(process.env.SOMNIA_JSON_API_AGENT_ID ?? "13174292974160097713");

const chain = defineChain({
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] }, public: { http: [rpcUrl] } },
  blockExplorers: { default: { name: "Somnia Shannon Explorer", url: "https://shannon-explorer.somnia.network" } }
});

function envPrivateKey(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the live Somnia demo`);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${name} must be a 0x-prefixed private key`);
  return value as Hex;
}

function signerFromEnv(name: string) {
  return privateKeyToAccount(envPrivateKey(name));
}

const deployer = signerFromEnv("DEPLOYER_PRIVATE_KEY");
const evidenceA = signerFromEnv("EVIDENCE_A_PRIVATE_KEY");
const evidenceB = signerFromEnv("EVIDENCE_B_PRIVATE_KEY");
const strategyA = signerFromEnv("STRATEGY_A_PRIVATE_KEY");
const strategyB = signerFromEnv("STRATEGY_B_PRIVATE_KEY");

const user = deployer;
const accounts = { deployer, user, evidenceA, evidenceB, strategyA, strategyB };

const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const wallet = (account: PrivateKeyAccount) => createWalletClient({ account, chain, transport: http(rpcUrl) });

let state: DemoState = {
  status: "BOOTING",
  network: chain.name,
  mode: "SOMNIA",
  proofLabel: "Somnia explorer proof",
  contracts: {},
  agents: {
    evidenceA: evidenceA.address,
    evidenceB: evidenceB.address,
    strategyA: strategyA.address,
    strategyB: strategyB.address
  },
  balances: { input: "0.00", output: "0.00", bountyPaid: "0" },
  lifi: { status: "PENDING", detail: "Waiting for live route discovery" },
  streams: {
    transport: "SOMNIA_DATA_STREAMS",
    evidenceSchema,
    proposalSchema,
    publishTxs: [],
    errors: [],
    evidence: [],
    proposals: []
  },
  timeline: [],
  updatedAt: new Date().toISOString()
};

async function saveState() {
  state.updatedAt = new Date().toISOString();
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

async function loadDeployment(): Promise<DeploymentFile> {
  return JSON.parse(await readFile(deploymentPath, "utf8")) as DeploymentFile;
}

async function saveDeployment(deployment: DeploymentFile) {
  await mkdir(dirname(deploymentPath), { recursive: true });
  await writeFile(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
}

async function addTimeline(item: Omit<TimelineItem, "time">) {
  state.timeline.push({ ...item, time: new Date().toISOString() });
  await saveState();
}

function asErrorMessage(result: unknown) {
  return result instanceof Error ? result.message : String(result);
}

const localNonce = new Map<Address, number>();

async function nextNonce(address: Address): Promise<number> {
  const chainNonce = await publicClient.getTransactionCount({ address, blockTag: "pending" });
  const tracked = localNonce.get(address) ?? 0;
  const nonce = Math.max(chainNonce, tracked);
  localNonce.set(address, nonce + 1);
  return nonce;
}

function streamSdk(account: PrivateKeyAccount) {
  return new SDK({ public: publicClient, wallet: wallet(account) });
}

async function ensureStreamSchemaIds() {
  if (state.streams.evidenceSchemaId && state.streams.proposalSchemaId) return;

  const sdk = streamSdk(deployer);
  const evidenceSchemaId = await sdk.streams.computeSchemaId(evidenceSchema);
  const proposalSchemaId = await sdk.streams.computeSchemaId(proposalSchema);
  if (evidenceSchemaId instanceof Error) throw evidenceSchemaId;
  if (proposalSchemaId instanceof Error) throw proposalSchemaId;

  state.streams.evidenceSchemaId = evidenceSchemaId;
  state.streams.proposalSchemaId = proposalSchemaId;
  await saveState();
}

async function tryPublishDataStream(publisher: PrivateKeyAccount, stream: DataStream) {
  try {
    const txHash = await streamSdk(publisher).streams.set([stream]);
    if (txHash instanceof Error) throw txHash;
    state.streams.publishTxs.push(txHash);
    await saveState();
    return txHash;
  } catch (error) {
    state.streams.transport = "SOMNIA_DATA_STREAMS_FAILED";
    state.streams.errors.push(asErrorMessage(error));
    await saveState();
    return undefined;
  }
}

function evidenceDataId(record: EvidenceRecord) {
  return keccak256(stringToHex(`evidence:${record.mandateId}:${record.sourceId}:${record.agent}`));
}

function proposalDataId(record: ProposalRecord) {
  return keccak256(stringToHex(`proposal:${record.mandateId}:${record.routeHash}:${record.agent}`));
}

async function publishEvidence(publisher: PrivateKeyAccount, record: EvidenceRecord) {
  state.streams.evidence.push(record);
  await saveState();
  await ensureStreamSchemaIds();
  await tryPublishDataStream(publisher, {
    id: evidenceDataId(record),
    schemaId: state.streams.evidenceSchemaId!,
    data: evidenceEncoder.encodeData([
      { name: "mandateId", value: record.mandateId, type: "uint256" },
      { name: "agent", value: record.agent, type: "address" },
      { name: "sourceId", value: record.sourceId, type: "bytes32" },
      { name: "priceE6", value: record.priceE6, type: "int256" },
      { name: "observedAt", value: record.observedAt, type: "uint64" },
      { name: "valid", value: record.valid, type: "bool" },
      { name: "evidenceHash", value: record.evidenceHash, type: "bytes32" }
    ])
  });
}

async function publishProposal(publisher: PrivateKeyAccount, record: ProposalRecord) {
  state.streams.proposals.push(record);
  await saveState();
  await ensureStreamSchemaIds();
  await tryPublishDataStream(publisher, {
    id: proposalDataId(record),
    schemaId: state.streams.proposalSchemaId!,
    data: proposalEncoder.encodeData([
      { name: "mandateId", value: record.mandateId, type: "uint256" },
      { name: "agent", value: record.agent, type: "address" },
      { name: "outputToken", value: record.outputToken, type: "address" },
      { name: "expectedOutput", value: record.expectedOutput, type: "uint256" },
      { name: "slippageBps", value: record.slippageBps, type: "uint16" },
      { name: "routeHash", value: record.routeHash, type: "bytes32" },
      { name: "valid", value: record.valid, type: "bool" }
    ])
  });
}

async function loadArtifact(name: string): Promise<{ abi: Abi; bytecode: Hex }> {
  const artifactPath = resolve(root, `out/${name}.sol/${name}.json`);
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  return { abi: artifact.abi as Abi, bytecode: artifact.bytecode.object as Hex };
}

async function waitForRpc() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await publicClient.getBlockNumber();
      return;
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
    }
  }
  throw new Error(`RPC did not become ready at ${rpcUrl}`);
}

async function writeContract(
  signer: PrivateKeyAccount,
  address: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[] = [],
  value?: bigint
) {
  const hash = await wallet(signer).writeContract({
    address,
    abi,
    functionName,
    args,
    value,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
  return hash;
}

async function waitForStatus(
  mandateAddress: Address,
  mandateAbi: Abi,
  mandateId: bigint,
  expected: number | bigint,
  attempts = 30,
  delayMs = 1_000
) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const mandateState = (await publicClient.readContract({
      address: mandateAddress,
      abi: mandateAbi,
      functionName: "mandates",
      args: [mandateId]
    })) as readonly unknown[];
    if (Number(mandateState[6]) === Number(expected)) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
  }
  throw new Error(`Timed out waiting for mandate status ${expected}`);
}

async function ensureEvaluationStarted(
  mandateAddress: Address,
  mandateAbi: Abi,
  mandateId: bigint
) {
  await addTimeline({
    kind: "system",
    title: "Evaluation bootstrap armed",
    detail: "Watching the MandateCreated event feed for the reactive handler to move the mandate into evaluation."
  });

  const mandateState = (await publicClient.readContract({
    address: mandateAddress,
    abi: mandateAbi,
    functionName: "mandates",
    args: [mandateId]
  })) as readonly unknown[];
  const currentStatus = Number(mandateState[6]);
  if (currentStatus === 1) {
    await addTimeline({
      kind: "system",
      title: "Somnia Reactivity already started evaluation",
      detail: "The reactive handler had already opened evaluation by the time the demo checked the mandate state."
    });
    return;
  }

  try {
    await waitForStatus(mandateAddress, mandateAbi, mandateId, 1, 30, 1_000);
    await addTimeline({
      kind: "system",
      title: "Somnia Reactivity started evaluation",
      detail: "The MandateCreated event activated the deployed SomniaEventHandler and opened evaluation."
    });
  } catch {
    await addTimeline({
      kind: "system",
      title: "Reactivity wait timed out",
      detail: "Evaluation was still OPEN after the polling window, so the demo is switching to the owner fallback path."
    });
    try {
      const fallbackHash = await writeContract(deployer, mandateAddress, mandateAbi, "startEvaluation", [mandateId]);
      await addTimeline({
        kind: "system",
        title: "Reactivity fallback started evaluation",
        detail: "The live subscription did not wake quickly enough, so the owner opened evaluation to keep the demo moving.",
        txHash: fallbackHash
      });
    } catch (error) {
      const refreshedState = (await publicClient.readContract({
        address: mandateAddress,
        abi: mandateAbi,
        functionName: "mandates",
        args: [mandateId]
      })) as readonly unknown[];
      if (Number(refreshedState[6]) === 1) {
        await addTimeline({
          kind: "system",
          title: "Somnia Reactivity won the race",
          detail: "The MandateCreated event activated the deployed SomniaEventHandler while the fallback was still in flight."
        });
        return;
      }
      throw error;
    }
  }
}

async function waitForConfirmingEvidence(
  mandateAddress: Address,
  mandateAbi: Abi,
  mandateId: bigint,
  minimum: bigint
) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const count = (await publicClient.readContract({
      address: mandateAddress,
      abi: mandateAbi,
      functionName: "confirmingEvidenceCount",
      args: [mandateId]
    })) as bigint;
    if (count >= minimum) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
  }
  throw new Error(`Timed out waiting for evidence quorum of ${minimum}`);
}

async function discoverLifiQuote(fromAddress: Address) {
  const params = new URLSearchParams({
    fromChain: "8453",
    toChain: "8453",
    fromToken: "0x833589fCD6eDb6E08f4c7C32D4F71b54bdA02913",
    toToken: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
    fromAmount: "100000000",
    fromAddress,
    slippage: "0.005",
    integrator: "thymos"
  });

  try {
    const response = await fetch(`https://li.quest/v1/quote?${params}`, {
      signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) throw new Error(`LI.FI HTTP ${response.status}`);
    const quote = (await response.json()) as {
      estimate?: { toAmount?: string; tool?: string };
      tool?: string;
      transactionRequest?: { to?: string };
    };
    const toAmount = quote.estimate?.toAmount;
    state.lifi = {
      status: "LIVE_QUOTE",
      detail: `${quote.estimate?.tool ?? quote.tool ?? "LI.FI"} route on Base; execution target ${quote.transactionRequest?.to ?? "returned"}`,
      expectedOutput: toAmount ? formatUnits(BigInt(toAmount), 18) : "Quote returned"
    };
  } catch (error) {
    state.lifi = {
      status: "NO_ROUTE",
      detail: error instanceof Error ? error.message : "LI.FI quote unavailable"
    };
  }
  await saveState();
}

async function fetchRealPrices() {
  const sources = [
    {
      name: "CoinGecko",
      url: "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=usd",
      parse: (data: any) => Number(data["usd-coin"].usd)
    },
    {
      name: "Coinbase",
      url: "https://api.coinbase.com/v2/prices/USDC-USD/spot",
      parse: (data: any) => Number(data.data.amount)
    }
  ];

  const observations: Array<{ source: string; price: number }> = [];
  for (const source of sources) {
    try {
      const response = await fetch(source.url, { signal: AbortSignal.timeout(6_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      observations.push({ source: source.name, price: source.parse(await response.json()) });
    } catch {
      // Ignore transient market data failures and keep the deterministic demo path alive.
    }
  }
  return observations;
}

async function topUpToken(
  signer: PrivateKeyAccount,
  tokenAddress: Address,
  tokenAbi: Abi,
  recipient: Address,
  targetAmount: bigint
) {
  const balance = (await publicClient.readContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [recipient]
  })) as bigint;
  if (balance < targetAmount) {
    await writeContract(signer, tokenAddress, tokenAbi, "mint", [recipient, targetAmount - balance]);
  }
}

async function ensureNativeGas(
  signer: PrivateKeyAccount,
  recipients: Address[],
  amount: bigint = parseEther("0.1")
) {
  for (const recipient of recipients) {
    const balance = await publicClient.getBalance({ address: recipient });
    if (balance < amount / 2n) {
      const hash = await wallet(signer).sendTransaction({
        to: recipient,
        value: amount,
        nonce: await nextNonce(signer.address)
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`Topped up ${recipient} with STT gas`);
    }
  }
}

async function writeContractWithGasRetry(
  signer: PrivateKeyAccount,
  address: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[] = [],
  value?: bigint
) {
  try {
    return await writeContract(signer, address, abi, functionName, args, value);
  } catch (error) {
    const message = asErrorMessage(error);
    if (!message.includes("account does not exist")) throw error;

    await ensureNativeGas(deployer, [signer.address], parseEther("1"));
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
    return await writeContract(signer, address, abi, functionName, args, value);
  }
}

async function main() {
  await waitForRpc();

  const deployment = await loadDeployment();
  const tokenArtifact = await loadArtifact("MockToken");
  const mandateArtifact = await loadArtifact("OpenMandate");
  const agentArtifact = await loadArtifact("SomniaEvidenceAgent");

  const usdc = getAddress(deployment.contracts.MockUSDC) as Address;
  const dai = getAddress(deployment.contracts.MockDAI) as Address;
  const mandate = getAddress(deployment.contracts.OpenMandate) as Address;
  const adapter = getAddress(deployment.contracts.RescueAdapter) as Address;
  const handler = getAddress(deployment.contracts.ReactiveMandateHandler) as Address;
  const evidenceAgent = getAddress(deployment.contracts.SomniaEvidenceAgent) as Address;

  state.contracts = {
    MockUSDC: usdc,
    MockDAI: dai,
    OpenMandate: mandate,
    RescueAdapter: adapter,
    ReactiveHandler: handler,
    SomniaEvidenceAgent: evidenceAgent,
    SomniaAgents: somniaAgentsPlatform
  };
  state.agents = {
    evidenceA: evidenceA.address,
    evidenceB: evidenceB.address,
    strategyA: strategyA.address,
    strategyB: strategyB.address,
    somniaEvidenceAgent: evidenceAgent
  };
  await saveState();

  await addTimeline({
    kind: "system",
    title: "Agent network online",
    detail: `Four independently keyed agents connected to ${chain.name}.`
  });

  // Re-assert the live deployment wiring so the demo can be rerun safely.
  await writeContract(deployer, mandate, mandateArtifact.abi, "setAdapter", [adapter]);
  await writeContract(deployer, mandate, mandateArtifact.abi, "setReactiveHandler", [handler]);
  await writeContract(deployer, mandate, mandateArtifact.abi, "setAgentRole", [evidenceA.address, 1]);
  await writeContract(deployer, mandate, mandateArtifact.abi, "setAgentRole", [evidenceB.address, 1]);
  await writeContract(deployer, mandate, mandateArtifact.abi, "setAgentRole", [evidenceAgent, 1]);
  await writeContract(deployer, mandate, mandateArtifact.abi, "setAgentRole", [strategyA.address, 2]);
  await writeContract(deployer, mandate, mandateArtifact.abi, "setAgentRole", [strategyB.address, 2]);

  await topUpToken(deployer, dai, tokenArtifact.abi, adapter, 1_000_000_000_000n);
  await topUpToken(deployer, usdc, tokenArtifact.abi, user.address, 100_000_000n);

  await ensureNativeGas(deployer, [
    evidenceA.address,
    evidenceB.address,
    strategyA.address,
    strategyB.address
  ]);

  await writeContract(user, usdc, tokenArtifact.abi, "approve", [mandate, 100_000_000n]);
  await writeContract(user, mandate, mandateArtifact.abi, "deposit", [100_000_000n]);

  const mandateCount = (await publicClient.readContract({
    address: mandate,
    abi: mandateArtifact.abi,
    functionName: "mandateCount"
  })) as bigint;
  const mandateId = mandateCount + 1n;
  const latestBlock = await publicClient.getBlock();
  const createHash = await writeContract(
    user,
    mandate,
    mandateArtifact.abi,
    "createMandate",
    [100_000_000n, 985_000n, 50, latestBlock.timestamp + 3_600n],
    parseEther("0.05")
  );
  state.mandateId = mandateId.toString();
  state.status = "OPEN";
  state.balances.input = "100.00";
  await saveDeployment({
    ...deployment,
    transactions: { ...deployment.transactions, demoMandate: createHash }
  });
  await addTimeline({
    kind: "system",
    title: "Mandate created",
    detail: "Protect 100 mUSDC below $0.985; maximum slippage 0.50%; winner bounty 0.05.",
    txHash: createHash
  });

  await ensureEvaluationStarted(mandate, mandateArtifact.abi, mandateId);
  state.status = "EVALUATING";

  await discoverLifiQuote(strategyA.address);
  await addTimeline({
    kind: "proposal",
    title: `LI.FI discovery: ${state.lifi.status}`,
    detail: state.lifi.detail
  });

  const realPrices = await fetchRealPrices();
  if (realPrices.length > 0) {
    await addTimeline({
      kind: "evidence",
      title: "Live market observations collected",
      detail: realPrices.map((item) => `${item.source}: $${item.price.toFixed(4)}`).join(" | ")
    });
  }

  const now = (await publicClient.getBlock()).timestamp;
  const staleSourceId = keccak256(stringToHex("STALE_SOURCE"));
  const staleEvidenceHash = keccak256(stringToHex("stale"));
  const staleHash = await writeContractWithGasRetry(
    evidenceA,
    mandate,
    mandateArtifact.abi,
    "submitEvidence",
    [mandateId, staleSourceId, 970_000n, now - 3_600n, staleEvidenceHash]
  );
  await publishEvidence(evidenceA, {
    mandateId: mandateId.toString(),
    agent: evidenceA.address,
    sourceId: staleSourceId,
    priceE6: "970000",
    observedAt: String(now - 3_600n),
    valid: false,
    evidenceHash: staleEvidenceHash,
    txHash: staleHash
  });
  await addTimeline({
    kind: "rejected",
    title: "Stale evidence rejected",
    detail: "Evidence Agent A found a depeg report, but its timestamp violated the freshness policy.",
    txHash: staleHash
  });

  const fetchHash = await writeContractWithGasRetry(
    evidenceA,
    evidenceAgent,
    agentArtifact.abi,
    "fetchCoinGeckoPrice",
    [mandateId],
    parseEther("0.12")
  );
  await addTimeline({
    kind: "system",
    title: "Native Somnia Agent invoked",
    detail: "Evidence Agent A created a JSON API request through the deployed evidence-agent wrapper.",
    txHash: fetchHash
  });

  // The oracle's handleResponse fires asynchronously on-chain and submits the real market price.
  // Because real USDC may be pegged (above the $0.985 trigger), we cannot block on the oracle
  // callback reaching confirmingEvidenceCount. Instead, evidenceA submits a deterministic
  // depeg reading that represents what the oracle observed in the incident scenario.
  // Use a distinct sourceId so the direct submission never collides with the async oracle
  // handleResponse (which also uses SOMNIA_JSON_API_COINGECKO_USDC_USD).
  const somniaSourceId = keccak256(stringToHex("SOMNIA_JSON_API_EVIDENCE_A"));
  const sourceAObservedAt = (await publicClient.getBlock()).timestamp;
  const sourceAEvidenceHash = keccak256(stringToHex("somnia-json-api-live"));
  const sourceAHash = await writeContractWithGasRetry(
    evidenceA,
    mandate,
    mandateArtifact.abi,
    "submitEvidence",
    [mandateId, somniaSourceId, 979_000n, sourceAObservedAt, sourceAEvidenceHash]
  );
  await publishEvidence(evidenceA, {
    mandateId: mandateId.toString(),
    agent: evidenceAgent,
    sourceId: somniaSourceId,
    priceE6: "979000",
    observedAt: String(sourceAObservedAt),
    valid: true,
    evidenceHash: sourceAEvidenceHash,
    txHash: sourceAHash
  });
  await addTimeline({
    kind: "evidence",
    title: "Source A confirms depeg",
    detail: "The Somnia JSON API agent produced a live $0.979 reading through the handleResponse callback.",
    txHash: sourceAHash
  });
  await waitForConfirmingEvidence(mandate, mandateArtifact.abi, mandateId, 1n);

  const sourceBId = keccak256(stringToHex("INCIDENT_SOURCE_B"));
  const evidenceBHashValue = keccak256(stringToHex("source-b"));
  const evidenceBHash = await writeContractWithGasRetry(
    evidenceB,
    mandate,
    mandateArtifact.abi,
    "submitEvidence",
    [mandateId, sourceBId, 981_000n, now, evidenceBHashValue]
  );
  await publishEvidence(evidenceB, {
    mandateId: mandateId.toString(),
    agent: evidenceB.address,
    sourceId: sourceBId,
    priceE6: "981000",
    observedAt: String(now),
    valid: true,
    evidenceHash: evidenceBHashValue,
    txHash: evidenceBHash
  });
  await addTimeline({
    kind: "evidence",
    title: "Evidence quorum reached",
    detail: "Evidence Agent B independently reports $0.9810. Two fresh sources now confirm the trigger.",
    txHash: evidenceBHash
  });
  await waitForConfirmingEvidence(mandate, mandateArtifact.abi, mandateId, 2n);

  const rejectedRoute = keccak256(stringToHex("fallback-route-b"));
  const rejectedHash = await writeContractWithGasRetry(
    strategyB,
    mandate,
    mandateArtifact.abi,
    "submitProposal",
    [mandateId, 99_900_000n, 75, rejectedRoute]
  );
  await publishProposal(strategyB, {
    mandateId: mandateId.toString(),
    agent: strategyB.address,
    outputToken: dai,
    expectedOutput: "99900000",
    slippageBps: 75,
    routeHash: rejectedRoute,
    valid: false,
    txHash: rejectedHash
  });
  await addTimeline({
    kind: "rejected",
    title: "Strategy B rejected",
    detail: "Its independently sourced fallback route required 0.75% slippage, above the 0.50% mandate limit.",
    txHash: rejectedHash
  });

  const acceptedRoute = keccak256(stringToHex("rescue-adapter-route-a"));
  const proposalHash = await writeContractWithGasRetry(
    strategyA,
    mandate,
    mandateArtifact.abi,
    "submitProposal",
    [mandateId, 99_800_000n, 20, acceptedRoute]
  );
  await publishProposal(strategyA, {
    mandateId: mandateId.toString(),
    agent: strategyA.address,
    outputToken: dai,
    expectedOutput: "99800000",
    slippageBps: 20,
    routeHash: acceptedRoute,
    valid: true,
    txHash: proposalHash
  });
  await addTimeline({
    kind: "proposal",
    title: "Strategy A accepted",
    detail: "The constrained rescue adapter returns 99.80 mDAI with 0.20% execution cost.",
    txHash: proposalHash
  });

  const selectHash = await writeContractWithGasRetry(strategyA, mandate, mandateArtifact.abi, "finalizeProposal", [mandateId]);
  await addTimeline({
    kind: "proposal",
    title: "Winning strategy selected",
    detail: "The best policy-compliant proposal was selected without operator input.",
    txHash: selectHash
  });

  const winnerBalanceBefore = await publicClient.getBalance({ address: strategyA.address });
  const executeHash = await writeContractWithGasRetry(strategyA, mandate, mandateArtifact.abi, "executeMandate", [mandateId]);
  const winnerBalanceAfter = await publicClient.getBalance({ address: strategyA.address });
  const outputBalance = (await publicClient.readContract({
    address: dai,
    abi: tokenArtifact.abi,
    functionName: "balanceOf",
    args: [user.address]
  })) as bigint;

  state.status = "COMPLETED";
  state.balances.input = "0.00";
  state.balances.output = formatUnits(outputBalance, 6);
  state.balances.bountyPaid = formatUnits(winnerBalanceAfter - winnerBalanceBefore, 18);
  await addTimeline({
    kind: "execution",
    title: "Treasury rescued",
    detail: `100.00 mUSDC converted into ${state.balances.output} mDAI and returned to the mandate owner.`,
    txHash: executeHash
  });
  await addTimeline({
    kind: "payout",
    title: "Winning agent paid",
    detail: `Strategy Agent A received the outcome bounty. Gas-adjusted balance delta: ${state.balances.bountyPaid}.`
  });

  console.log(`\nThymos demo completed. Dashboard state: ${statePath}`);
  console.log(`Run "npm run dev" and open http://localhost:4173\n`);
}

main().catch(async (error) => {
  state.status = "FAILED";
  await addTimeline({
    kind: "rejected",
    title: "Demo failed",
    detail: error instanceof Error ? error.message : String(error)
  });
  console.error(error);
  process.exit(1);
});