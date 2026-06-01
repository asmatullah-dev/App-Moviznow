import { setDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './src/firebase';

async function test() {
   const ref = doc(db, 'test', 'merge_doc');
   await setDoc(ref, { users: { A: 1, B: 2 } });
   await setDoc(ref, { users: { C: 3 } }, { merge: true });
   const snap1 = await getDoc(ref);
   console.log("After setDoc merge:", snap1.data());
   
   await setDoc(ref, { "users.D": 4 }, { merge: true });
   const snap2 = await getDoc(ref);
   console.log("After setDoc dot notation:", snap2.data());

   process.exit(0);
}
test().catch(e => console.error(e));
