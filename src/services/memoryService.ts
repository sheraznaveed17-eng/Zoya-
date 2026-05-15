import { collection, addDoc, getDocs, query, orderBy, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

export interface Interaction {
  name: string;
  summary: string;
  timestamp: Timestamp;
}

export async function saveInteraction(name: string, summary: string) {
  try {
    await addDoc(collection(db, "interactions"), {
      name,
      summary,
      timestamp: Timestamp.now()
    });
  } catch (e) {
    console.error("Error saving interaction:", e);
  }
}

export async function getInteractions(): Promise<Interaction[]> {
  try {
    const q = query(collection(db, "interactions"), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Interaction);
  } catch (e) {
    console.error("Error getting interactions:", e);
    return [];
  }
}
