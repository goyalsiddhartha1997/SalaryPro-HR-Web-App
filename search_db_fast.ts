import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function main() {
  console.log("--- DB SEARCH FOR RAM/SINGH/DAYAL ---");
  
  // 1. Search employees
  const employeesSnap = await getDocs(collection(db, "employees"));
  console.log(`\nActive Employees docs (${employeesSnap.size}):`);
  let found68 = false;
  employeesSnap.forEach(d => {
    const data = d.data();
    if (d.id === "68") {
      found68 = true;
      console.log(`[active] ID=68 FOUND:`, JSON.stringify(data));
    }
    if (d.id === "24" || (data.name && (data.name.includes("Ram") || data.name.includes("Singh") || data.name.includes("Dayal")))) {
      console.log(`[active] ID=${d.id} name="${data.name}" salary=${data.monthlySalary} type=${data.salaryType}`);
    }
  });
  if (!found68) {
    console.log("[active] ID=68 was NOT found in the entire collection.");
  }

  // 2. Search recycle_bin
  const rbSnap = await getDocs(collection(db, "recycle_bin"));
  console.log(`\nRecycle Bin docs (${rbSnap.size}):`);
  rbSnap.forEach(d => {
    const data = d.data();
    if (d.id === "24" || (data.name && (data.name.includes("Ram") || data.name.includes("Singh") || data.name.includes("Dayal")))) {
      console.log(`[recycle] ID=${d.id} name="${data.name}" deletedAt=${data.deletedAt} deletedBy=${data.deletedBy}`);
    }
  });

  console.log("\n--- SEARCH COMPLETE ---");
  process.exit(0);
}

main().catch(err => {
  console.error("Error in search:", err);
  process.exit(1);
});
