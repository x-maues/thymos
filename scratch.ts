import { createPublicClient, defineChain, http } from "viem";
const rpcUrl = "https://dream-rpc.somnia.network/";
const chain = defineChain({ id: 50312, name: "Somnia", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] }, public: { http: [rpcUrl] } } });
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
async function main() {
  const mandateState = await publicClient.readContract({
    address: "0x68f557460Df4c1C0838729Eb29d5F025A69f4a88",
    abi: [{ type: "function", name: "mandates", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint16" }, { type: "uint64" }, { type: "uint8" }, { type: "address" }, { type: "uint256" }], stateMutability: "view" }],
    functionName: "mandates",
    args: [6n]
  });
  console.log(typeof mandateState[6], mandateState[6]);
}
main();
