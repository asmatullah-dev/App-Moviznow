import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

// Initialize Firebase Admin
const serviceAccount = JSON.parse(
  readFileSync(join(process.cwd(), 'source-key.json'), 'utf8')
);

const firebaseConfig = JSON.parse(
  readFileSync(join(process.cwd(), 'firebase-applet-config.json'), 'utf8')
);

const app = initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function updateSearchIndex() {
  console.log('🚀 Starting search index update...');
  
  try {
    const contentSnap = await db.collection('content').get();
    const contentList = contentSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];

    console.log(`📦 Found ${contentList.length} total items.`);

    const searchIndex = contentList
      .filter(c => c.status === 'published')
      .map(c => {
        let seasons: any[] = [];
        if (c.seasons) {
          try {
            seasons = Array.isArray(c.seasons) ? c.seasons : JSON.parse(c.seasons as string);
          } catch (e) {
            console.error("Failed to parse seasons for search index", e);
          }
        }
        const seasonsInfo = seasons.map(s => {
          const lastEp = s.episodes && s.episodes.length > 0 ? s.episodes[s.episodes.length - 1].episodeNumber : '';
          return `${s.seasonNumber}:${lastEp}`;
        }).join(',') || '';
        
        return `${c.id}|${c.title || ''}|${c.year || ''}|${c.posterUrl || ''}|${c.type || 'movie'}|${c.qualityId || ''}|${(c.languageIds || []).join(',')}|${(c.genreIds || []).join(',')}|${c.createdAt || ''}|${c.order ?? ''}|${seasonsInfo}`;
      });

    console.log(`🔍 Indexed ${searchIndex.length} published items.`);

    await db.collection('metadata').doc('search_index').set({
      data: searchIndex,
      updatedAt: FieldValue.serverTimestamp(),
      count: searchIndex.length
    });

    console.log('✅ Search index updated successfully in metadata/search_index');
    
    // Optional: Also update individual document search keywords if needed
    // This part is often used for Firestore native searching
    /*
    const batch = db.batch();
    contentList.forEach(item => {
      const keywords = generateKeywords(item.title);
      batch.update(db.collection('content').doc(item.id), { searchKeywords: keywords });
    });
    await batch.commit();
    */

  } catch (error) {
    console.error('❌ Error updating search index:', error);
    process.exit(1);
  }
}

function generateKeywords(title: string): string[] {
  if (!title) return [];
  const words = title.toLowerCase().split(/[\s\-:]+/).filter(w => w.length > 0);
  const keywords = new Set<string>();
  
  words.forEach(word => {
    for (let i = 1; i <= word.length; i++) {
      keywords.add(word.substring(0, i));
    }
  });
  
  return Array.from(keywords);
}

updateSearchIndex();
