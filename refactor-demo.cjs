const fs = require('fs');
let code = fs.readFileSync('agents/src/demo.ts', 'utf8');

// Insert dynamic loading right after waitForRpc
const loadDraftCode = `
  let draftAmountStr = "100";
  let draftTriggerStr = "0.985";
  let draftSlippageStr = "50";
  let draftBountyStr = "0.05";
  let draftExpiryStr = "60";
  try {
    const draftPath = require("path").resolve(process.cwd(), "frontend/public/draft.json");
    if (require("fs").existsSync(draftPath)) {
      const parsed = JSON.parse(require("fs").readFileSync(draftPath, "utf8"));
      if (parsed) {
        draftAmountStr = parsed.amount || draftAmountStr;
        draftTriggerStr = parsed.triggerPrice || draftTriggerStr;
        draftSlippageStr = parsed.maxSlippageBps || draftSlippageStr;
        draftBountyStr = parsed.bounty || draftBountyStr;
        draftExpiryStr = parsed.expiryMinutes || draftExpiryStr;
      }
    }
  } catch (e) {}

  const draftAmount = parseUnits(draftAmountStr, 6);
  const draftTriggerE6 = parseUnits(draftTriggerStr, 6);
  const draftSlippageBps = Number(draftSlippageStr);
  const draftBounty = parseEther(draftBountyStr);
  const draftExpiryOffset = BigInt(draftExpiryStr) * 60n;

  const evidencePriceA_E6 = draftTriggerE6 - 15_000n; 
  const evidencePriceB_E6 = draftTriggerE6 - 10_000n;
  const rejectedSlippage = draftSlippageBps + 25;
  const acceptedSlippage = Math.max(1, draftSlippageBps - 10);
  const expectedOutput = draftAmount - (draftAmount * BigInt(acceptedSlippage)) / 10000n;
  const rejectedOutput = draftAmount - (draftAmount * BigInt(rejectedSlippage)) / 10000n;
`;

code = code.replace("await waitForRpc();\n", "await waitForRpc();\n" + loadDraftCode + "\n");

// Replace topUpToken usages
code = code.replace(/await topUpToken\(deployer, usdc, tokenArtifact\.abi, user\.address, 100_000_000n\);/, 
                    "await topUpToken(deployer, usdc, tokenArtifact.abi, user.address, draftAmount);");

// Replace approvals and deposits
code = code.replace(/await writeContract\(user, usdc, tokenArtifact\.abi, "approve", \[mandate, 100_000_000n\]\);/, 
                    "await writeContract(user, usdc, tokenArtifact.abi, \"approve\", [mandate, draftAmount]);");
code = code.replace(/await writeContract\(user, mandate, mandateArtifact\.abi, "deposit", \[100_000_000n\]\);/, 
                    "await writeContract(user, mandate, mandateArtifact.abi, \"deposit\", [draftAmount]);");

// Replace createMandate
code = code.replace(/\[100_000_000n, 985_000n, 50, latestBlock\.timestamp \+ 3_600n\],/g, 
                    "[draftAmount, draftTriggerE6, draftSlippageBps, latestBlock.timestamp + draftExpiryOffset],");
code = code.replace(/parseEther\("0\.05"\)\n\s+\);/g, "draftBounty\n  );");

// Replace timeline text for createMandate
code = code.replace(/Protect 100 mUSDC below \$0\.985; maximum slippage 0\.50%; winner bounty 0\.05\./g, 
                    "`Protect ${draftAmountStr} mUSDC below $${draftTriggerStr}; maximum slippage ${draftSlippageBps / 100}%; winner bounty ${draftBountyStr}.`");

// Replace stale evidence submission
code = code.replace(/\[mandateId, staleSourceId, 970_000n, now - 3_600n, staleEvidenceHash\]/, 
                    "[mandateId, staleSourceId, evidencePriceA_E6, now - draftExpiryOffset, staleEvidenceHash]");
code = code.replace(/priceE6: "970000",/, "priceE6: evidencePriceA_E6.toString(),");
code = code.replace(/String\(now - 3_600n\)/g, "String(now - draftExpiryOffset)");

// Replace somnia evidence publish
code = code.replace(/priceE6: "979000",/, "priceE6: evidencePriceA_E6.toString(),");
code = code.replace(/\$0\.979/g, "$${(Number(evidencePriceA_E6) / 1000000).toFixed(4)}");

// Replace evidence B submission
code = code.replace(/\[mandateId, sourceBId, 981_000n, now, evidenceBHashValue\]/, 
                    "[mandateId, sourceBId, evidencePriceB_E6, now, evidenceBHashValue]");
code = code.replace(/priceE6: "981000",/, "priceE6: evidencePriceB_E6.toString(),");
code = code.replace(/\$0\.9810/g, "$${(Number(evidencePriceB_E6) / 1000000).toFixed(4)}");

// Replace rejected proposal
code = code.replace(/\[mandateId, 99_900_000n, 75, rejectedRoute\]/, 
                    "[mandateId, rejectedOutput, rejectedSlippage, rejectedRoute]");
code = code.replace(/expectedOutput: "99900000",/, "expectedOutput: rejectedOutput.toString(),");
code = code.replace(/slippageBps: 75,/g, "slippageBps: rejectedSlippage,");
code = code.replace(/0\.75%/g, "${rejectedSlippage / 100}%");
code = code.replace(/0\.50%/g, "${draftSlippageBps / 100}%");

// Replace accepted proposal
code = code.replace(/\[mandateId, 99_800_000n, 20, acceptedRoute\]/, 
                    "[mandateId, expectedOutput, acceptedSlippage, acceptedRoute]");
code = code.replace(/expectedOutput: "99800000",/, "expectedOutput: expectedOutput.toString(),");
code = code.replace(/slippageBps: 20,/g, "slippageBps: acceptedSlippage,");
code = code.replace(/0\.20%/g, "${acceptedSlippage / 100}%");

// Final timeline
code = code.replace(/balances\.input = "100\.00";/, "balances.input = draftAmountStr;");

fs.writeFileSync('agents/src/demo.ts', code);
console.log("Refactoring complete");
