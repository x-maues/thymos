import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { SDK as StreamsSDK, zeroBytes32 } from "@somnia-chain/streams";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  keccak256,
  parseGwei,
  type Abi,
  type Address,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

type Artifact = { abi: Abi; bytecode: Hex };

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

const root = resolve(import.meta.dirname, "../..");
const deploymentPath = resolve(root, "deployments/somnia-testnet.json");
const rpcUrl = process.env.RPC_URL ?? "https://dream-rpc.somnia.network/";
const explorerBaseUrl = process.env.EXPLORER_BASE_URL ?? "https://shannon-explorer.somnia.network";
const forceDeploy = process.env.FORCE_DEPLOY === "1";
const registerStreams = process.env.REGISTER_STREAM_SCHEMAS !== "0";
const createReactivitySubscription = process.env.CREATE_REACTIVITY_SUBSCRIPTION !== "0";
const somniaAgentsPlatform = (process.env.SOMNIA_AGENTS_PLATFORM ??
  "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776") as Address;
const somniaJsonApiAgentId = BigInt(process.env.SOMNIA_JSON_API_AGENT_ID ?? "13174292974160097713");
const evidenceSchema =
  "uint256 mandateId,address agent,bytes32 sourceId,int256 priceE6,uint64 observedAt,bool valid,bytes32 evidenceHash";
const proposalSchema =
  "uint256 mandateId,address agent,address outputToken,uint256 expectedOutput,uint16 slippageBps,bytes32 routeHash,bool valid";
const zeroSchemaParent = zeroBytes32 as Hex;
const mandateCreatedTopic = keccak256(
  new TextEncoder().encode("MandateCreated(uint256,address,uint256,uint256,uint256,uint16,uint64)")
) as Hex;
const reactivityPrecompile = "0x0000000000000000000000000000000000000100" as Address;
const onEventSelector = "0x53edf33d" as Hex;

const somniaTestnet = defineChain({
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] }, public: { http: [rpcUrl] } },
  blockExplorers: { default: { name: "Somnia Shannon Explorer", url: explorerBaseUrl } }
});

const reactivityPrecompileAbi = [
  {
    type: "function",
    name: "subscribe",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "subscriptionData",
        type: "tuple",
        components: [
          { name: "eventTopics", type: "bytes32[4]" },
          { name: "origin", type: "address" },
          { name: "caller", type: "address" },
          { name: "emitter", type: "address" },
          { name: "handlerContractAddress", type: "address" },
          { name: "handlerFunctionSelector", type: "bytes4" },
          { name: "priorityFeePerGas", type: "uint64" },
          { name: "maxFeePerGas", type: "uint64" },
          { name: "gasLimit", type: "uint64" },
          { name: "isGuaranteed", type: "bool" },
          { name: "isCoalesced", type: "bool" }
        ]
      }
    ],
    outputs: [{ name: "subscriptionId", type: "uint256" }]
  },
  {
    type: "event",
    name: "SubscriptionCreated",
    inputs: [
      { name: "subscriptionId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      {
        name: "subscriptionData",
        type: "tuple",
        indexed: false,
        components: [
          { name: "eventTopics", type: "bytes32[4]" },
          { name: "origin", type: "address" },
          { name: "caller", type: "address" },
          { name: "emitter", type: "address" },
          { name: "handlerContractAddress", type: "address" },
          { name: "handlerFunctionSelector", type: "bytes4" },
          { name: "priorityFeePerGas", type: "uint64" },
          { name: "maxFeePerGas", type: "uint64" },
          { name: "gasLimit", type: "uint64" },
          { name: "isGuaranteed", type: "bool" },
          { name: "isCoalesced", type: "bool" }
        ]
      }
    ]
  }
] as const satisfies Abi;

function envPrivateKey(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required in .env`);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${name} must be a 0x-prefixed private key`);
  return value as Hex;
}

function envAddress(name: string, privateKeyName: string) {
  const explicit = process.env[name];
  if (explicit) return getAddress(explicit) as Address;
  const key = process.env[privateKeyName];
  if (key) return privateKeyToAccount(key as Hex).address;
  throw new Error(`${name} or ${privateKeyName} is required in .env`);
}

function isEmpty(value: string | undefined) {
  return !value || value === "";
}

function isPlaceholder(value: string | undefined) {
  if (!value) return false;
  return /^0x(1234567890|2345678901|3456789012|4567890123|5678901234|6789012345|abcdef|bcdef|cdef|def|ef|f123)/i.test(
    value
  );
}

function hasRealDeployment(file: DeploymentFile) {
  return Object.values(file.contracts ?? {}).some((value) => !isEmpty(value) && !isPlaceholder(value));
}

async function loadDeploymentFile(): Promise<DeploymentFile> {
  const raw = await readFile(deploymentPath, "utf8");
  return JSON.parse(raw) as DeploymentFile;
}

async function saveDeploymentFile(file: DeploymentFile) {
  await mkdir(dirname(deploymentPath), { recursive: true });
  await writeFile(deploymentPath, `${JSON.stringify(file, null, 2)}\n`);
}

async function loadArtifact(name: string): Promise<Artifact> {
  const artifactPath = resolve(root, `out/${name}.sol/${name}.json`);
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  return { abi: artifact.abi as Abi, bytecode: artifact.bytecode.object as Hex };
}

async function main() {
  const deployer = privateKeyToAccount(envPrivateKey("DEPLOYER_PRIVATE_KEY"));
  const evidenceA = envAddress("EVIDENCE_A_ADDRESS", "EVIDENCE_A_PRIVATE_KEY");
  const evidenceB = envAddress("EVIDENCE_B_ADDRESS", "EVIDENCE_B_PRIVATE_KEY");
  const strategyA = envAddress("STRATEGY_A_ADDRESS", "STRATEGY_A_PRIVATE_KEY");
  const strategyB = envAddress("STRATEGY_B_ADDRESS", "STRATEGY_B_PRIVATE_KEY");

  const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account: deployer, chain: somniaTestnet, transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  if (chainId !== 50312) throw new Error(`Refusing deployment: expected Somnia testnet 50312, got ${chainId}`);

  const balance = await publicClient.getBalance({ address: deployer.address });
  if (balance < 40n * 10n ** 18n) {
    throw new Error(`Deployer has ${balance} wei. Keep at least 40 STT for contracts + reactivity subscription.`);
  }

  const existing = await loadDeploymentFile();
  if (hasRealDeployment(existing) && !forceDeploy) {
    throw new Error(
      `Refusing to redeploy over existing real addresses in ${deploymentPath}. Set FORCE_DEPLOY=1 only if you truly intend to spend gas again.`
    );
  }

  const tokenArtifact = await loadArtifact("MockToken");
  const mandateArtifact = await loadArtifact("OpenMandate");

  async function deploy(name: string, args: readonly unknown[] = []) {
    console.log(`Deploying ${name}...`);
    const artifact = await loadArtifact(name);
    const hash = await walletClient.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`${name} deployment failed: ${hash}`);
    console.log(`${name}: ${receipt.contractAddress} (${hash})`);
    return { address: receipt.contractAddress as Address, txHash: hash, abi: artifact.abi };
  }

  async function write(address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []) {
    console.log(`Calling ${functionName}...`);
    const hash = await walletClient.writeContract({ address, abi, functionName, args });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${functionName} failed: ${hash}`);
    return hash;
  }

  const usdc = await deploy("MockToken", ["Mock USDC", "mUSDC"]);
  const dai = await deploy("MockToken", ["Mock DAI", "mDAI"]);
  const mandate = await deploy("OpenMandate", [usdc.address, dai.address]);
  const adapter = await deploy("RescueAdapter", [mandate.address, usdc.address, dai.address, 20]);
  const handler = await deploy("ReactiveMandateHandler", [mandate.address]);
  const somniaEvidenceAgent = await deploy("SomniaEvidenceAgent", [
    somniaAgentsPlatform,
    somniaJsonApiAgentId,
    mandate.address
  ]);

  const setAdapter = await write(mandate.address, mandateArtifact.abi, "setAdapter", [adapter.address]);
  const setReactiveHandler = await write(mandate.address, mandateArtifact.abi, "setReactiveHandler", [handler.address]);
  const roleTxs = [
    await write(mandate.address, mandateArtifact.abi, "setAgentRole", [evidenceA, 1]),
    await write(mandate.address, mandateArtifact.abi, "setAgentRole", [evidenceB, 1]),
    await write(mandate.address, mandateArtifact.abi, "setAgentRole", [somniaEvidenceAgent.address, 1]),
    await write(mandate.address, mandateArtifact.abi, "setAgentRole", [strategyA, 2]),
    await write(mandate.address, mandateArtifact.abi, "setAgentRole", [strategyB, 2])
  ];

  let reactivitySubscriptionTx = "";
  let reactivitySubscriptionId = "";
  if (createReactivitySubscription) {
    console.log("Creating MandateCreated reactivity subscription...");
    const priorityFeePerGas = parseGwei(process.env.REACTIVITY_PRIORITY_FEE_GWEI ?? "2");
    const maxFeePerGas = parseGwei(process.env.REACTIVITY_MAX_FEE_GWEI ?? "20");
    const gasLimit = BigInt(process.env.REACTIVITY_GAS_LIMIT ?? "2000000");
    const hash = await walletClient.writeContract({
      address: reactivityPrecompile,
      abi: reactivityPrecompileAbi,
      functionName: "subscribe",
      args: [
        {
          eventTopics: [mandateCreatedTopic, "0x0000000000000000000000000000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000000000000000000000000000"],
          origin: "0x0000000000000000000000000000000000000000",
          caller: "0x0000000000000000000000000000000000000000",
          emitter: mandate.address,
          handlerContractAddress: handler.address,
          handlerFunctionSelector: onEventSelector,
          priorityFeePerGas,
          maxFeePerGas,
          gasLimit,
          isGuaranteed: true,
          isCoalesced: false
        }
      ]
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Reactivity subscription failed: ${hash}`);
    reactivitySubscriptionTx = hash;
    const created = receipt.logs.find((log) => log.address.toLowerCase() === reactivityPrecompile.toLowerCase());
    if (created?.topics[1]) reactivitySubscriptionId = BigInt(created.topics[1]).toString();
    console.log(`Reactivity subscription tx: ${hash}${reactivitySubscriptionId ? ` id ${reactivitySubscriptionId}` : ""}`);
  }

  let evidenceSchemaId: Hex | undefined;
  let proposalSchemaId: Hex | undefined;
  let evidenceSchemaRegistration: Hex | undefined;
  let proposalSchemaRegistration: Hex | undefined;
  if (registerStreams) {
    console.log("Registering Somnia Data Streams schemas...");
    const streams = new StreamsSDK({ public: publicClient, wallet: walletClient });
    const evidenceId = await streams.streams.computeSchemaId(evidenceSchema);
    const proposalId = await streams.streams.computeSchemaId(proposalSchema);
    if (evidenceId instanceof Error) throw evidenceId;
    if (proposalId instanceof Error) throw proposalId;
    evidenceSchemaId = evidenceId;
    proposalSchemaId = proposalId;

    const evidenceExists = await streams.streams.isDataSchemaRegistered(evidenceSchemaId);
    if (evidenceExists instanceof Error) throw evidenceExists;
    if (!evidenceExists) {
      const tx = await streams.streams.registerDataSchemas([
        { schemaName: "openmandate-evidence-v1", schema: evidenceSchema, parentSchemaId: zeroSchemaParent }
      ]);
      if (tx instanceof Error) throw tx;
      await publicClient.waitForTransactionReceipt({ hash: tx });
      evidenceSchemaRegistration = tx;
    }

    const proposalExists = await streams.streams.isDataSchemaRegistered(proposalSchemaId);
    if (proposalExists instanceof Error) throw proposalExists;
    if (!proposalExists) {
      const tx = await streams.streams.registerDataSchemas([
        { schemaName: "openmandate-proposal-v1", schema: proposalSchema, parentSchemaId: zeroSchemaParent }
      ]);
      if (tx instanceof Error) throw tx;
      await publicClient.waitForTransactionReceipt({ hash: tx });
      proposalSchemaRegistration = tx;
    }
  }

  const deployment: DeploymentFile = {
    network: "Somnia Testnet",
    chainId: 50312,
    rpcUrl,
    status: "deployed",
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      MockUSDC: usdc.address,
      MockDAI: dai.address,
      OpenMandate: mandate.address,
      RescueAdapter: adapter.address,
      ReactiveMandateHandler: handler.address,
      SomniaEvidenceAgent: somniaEvidenceAgent.address
    },
    transactions: {
      MockUSDC: usdc.txHash,
      MockDAI: dai.txHash,
      OpenMandate: mandate.txHash,
      RescueAdapter: adapter.txHash,
      ReactiveMandateHandler: handler.txHash,
      SomniaEvidenceAgent: somniaEvidenceAgent.txHash,
      setAdapter,
      setReactiveHandler,
      setAgentRoleEvidenceA: roleTxs[0],
      setAgentRoleEvidenceB: roleTxs[1],
      setAgentRoleSomniaEvidenceAgent: roleTxs[2],
      setAgentRoleStrategyA: roleTxs[3],
      setAgentRoleStrategyB: roleTxs[4],
      reactivitySubscription: reactivitySubscriptionTx,
      demoMandate: ""
    },
    somnia: {
      agentsPlatform: somniaAgentsPlatform,
      jsonApiAgentId: somniaJsonApiAgentId.toString(),
      reactivity: {
        subscriptionId: reactivitySubscriptionId,
        precompile: reactivityPrecompile,
        eventTopic: mandateCreatedTopic,
        priorityFeePerGas: process.env.REACTIVITY_PRIORITY_FEE_GWEI ?? "2",
        maxFeePerGas: process.env.REACTIVITY_MAX_FEE_GWEI ?? "20",
        gasLimit: process.env.REACTIVITY_GAS_LIMIT ?? "2000000"
      },
      dataStreams: {
        evidenceSchema,
        proposalSchema,
        evidenceSchemaId,
        proposalSchemaId,
        evidenceSchemaRegistration,
        proposalSchemaRegistration,
        evidenceStream: evidenceSchemaId ?? "",
        proposalStream: proposalSchemaId ?? ""
      }
    },
    explorer: { baseUrl: explorerBaseUrl }
  };

  await saveDeploymentFile(deployment);

  console.log(`\nDeployment recorded at ${deploymentPath}`);
  console.log(`${explorerBaseUrl}/address/${mandate.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
