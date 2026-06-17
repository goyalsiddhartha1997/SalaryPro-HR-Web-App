import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function main() {
  console.log("--- PRINT ALL RECYCLE BIN DOCS ---");
  const rbSnap = await getDocs(collection(db, "recycle_bin"));
  rbSnap.forEach(d => {
    const data = d.data();
    console.log(`ID=${d.id} name="${data.name}" deletedAt=${data.deletedAt} deletedBy=${data.deletedBy} data=`, JSON.stringify(data));
  });
  console.log("--- END ---");
  process.exit(0);
}

main().catch(console.error);
