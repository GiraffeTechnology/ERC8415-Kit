const fs = require("node:fs");
const solc = require("solc");
const names = ["RegisterProjectionReference.sol", "KitLifecycle.sol"];
const sources = Object.fromEntries(names.map(n => [n, {content: fs.readFileSync(n,"utf8")}]));
const input = {language:"Solidity",sources,settings:{optimizer:{enabled:true,runs:200},viaIR:true,
 outputSelection:{"*":{"*":["abi","evm.bytecode.object"]}}}};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
for (const error of output.errors || []) console.error(error.formattedMessage);
if ((output.errors || []).some(e => e.severity === "error")) process.exit(1);
fs.mkdirSync("out",{recursive:true});
for (const [file, contracts] of Object.entries(output.contracts))
 for (const [name, artifact] of Object.entries(contracts))
  fs.writeFileSync("out/"+name+".json",JSON.stringify(artifact));
