import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function main() {
  console.log("Searching in employees collection...");
  const employeesSnap = await getDocs(collection(db, "employees"));
  let foundEmps = 0;
  employeesSnap.forEach(d => {
    const data = d.data();
    if (data.name && data.name.includes("Ram")) {
      console.log(`Found Employee Doc: ID=${d.id} name="${data.name}" salary=${data.monthlySalary} type=${data.salaryType}`);
      foundEmps++;
    }
    // Also log if name field is missing but we want to check anyway
    if (d.id === '24' || d.id === '25' || data.name === 'Ram Singh' || (data.name && data.name.includes("Dayal"))) {
      console.log(`Matched Special ID check: ID=${d.id} data=`, JSON.stringify(data));
    }
  });
  console.log(`Completed employees. Total evaluated docs containing Ram: ${foundEmps}`);

  console.log("\nSearching in recycle_bin collection...");
  const rbSnap = await getDocs(collection(db, "recycle_bin"));
  let foundRb = 0;
  rbSnap.forEach(d => {
    const data = d.data();
    console.log(`Found Recycle Bin Doc: ID=${d.id} name="${data.name}" deletedAt=${data.deletedAt}`);
    foundRb++;
  });
  console.log(`Completed recycle_bin. Total docs: ${foundRb}`);
}

main().catch(console.error);
