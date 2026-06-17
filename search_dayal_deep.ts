import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function searchCollection(collPath: string) {
  const snap = await getDocs(collection(db, collPath));
  snap.forEach(d => {
    const data = d.data();
    const str = JSON.stringify(data);
    if (str.toLowerCase().includes("dayal") || d.id.toLowerCase().includes("dayal")) {
      console.log(`FOUND in ${collPath}: ID=${d.id} data=`, str);
    }
  });
}

async function main() {
  console.log("--- SCANNING ALL TABLES FOR 'DAYAL' ---");
  await searchCollection("employees");
  await searchCollection("recycle_bin");
  await searchCollection("custom_users");
  await searchCollection("gatePasses");
  await searchCollection("overtimeLogs");
  await searchCollection("loomOrders");
  await searchCollection("canteenFoodBills");

  // Let's check subcollections of employees
  const employeesSnap = await getDocs(collection(db, "employees"));
  for (const empDoc of employeesSnap.docs) {
    const empId = empDoc.id;
    // check punches subcollection
    const punchesSnap = await getDocs(collection(db, "employees", empId, "punches"));
    punchesSnap.forEach(d => {
      const punchesStr = JSON.stringify(d.data());
      if (punchesStr.toLowerCase().includes("dayal")) {
        console.log(`FOUND in employees/${empId}/punches: ID=${d.id} data=`, punchesStr);
      }
    });

    // check monthlyPayroll subcollection
    const paySnap = await getDocs(collection(db, "employees", empId, "monthlyPayroll"));
    paySnap.forEach(d => {
      const payStr = JSON.stringify(d.data());
      if (payStr.toLowerCase().includes("dayal")) {
        console.log(`FOUND in employees/${empId}/monthlyPayroll: ID=${d.id} data=`, payStr);
      }
    });
  }

  console.log("--- DISCOVERY SCAN COMPLETE ---");
  process.exit(0);
}

main().catch(console.error);
