
import { collection, getDocs } from 'firebase/firestore';
import { db } from './src/firebase';

async function debugMapping() {
    try {
        const [qSnap, lSnap, gSnap] = await Promise.all([
            getDocs(collection(db, 'qualities')),
            getDocs(collection(db, 'languages')),
            getDocs(collection(db, 'genres'))
        ]);

        const qs = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const ls = lSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const gs = gSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        console.log('Current Qualities:', qs);
        console.log('Current Languages:', ls);
        console.log('Current Genres:', gs);

    } catch (err) {
        console.error('Debug failed:', err);
    }
}

debugMapping();
