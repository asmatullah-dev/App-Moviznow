import { doc, getDoc, getDocs, collection, writeBatch, setDoc, updateDoc, deleteField, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '../firebase';
import { Content } from '../types';

export const CONTENT_CHUNK_SIZE = 100; 
export const SEARCH_CHUNK_SIZE = 1000; 

export interface ContentChunk {
  items: Record<string, Content>;
}

export interface SearchIndexChunk {
  data: string[];
}

/**
 * Fetches all items from chunked collections
 */
export async function fetchAllFromChunks<T>(collectionName: string, mergeFn: (data: any, acc: T[]) => void): Promise<T[]> {
  const snapshot = await getDocs(collection(db, collectionName));
  const results: T[] = [];
  snapshot.docs.forEach(doc => {
    mergeFn(doc.data(), results);
  });
  return results;
}

/**
 * Updates the sync metadata to trigger clients to refresh their cache
 */
async function updateSyncMetadata(): Promise<void> {
  try {
    const chunksSnap = await getDocs(collection(db, 'content_chunks'));
    const searchSnap = await getDocs(collection(db, 'search_index_chunks'));
    
    await setDoc(doc(db, 'metadata', 'content_sync'), {
      lastUpdated: new Date().toISOString(),
      updatedBy: 'system',
      contentChunkCount: chunksSnap.docs.length,
      searchShardCount: searchSnap.docs.length
    }, { merge: true });
  } catch (e) {
    console.error("Failed to update sync metadata", e);
  }
}

/**
 * Saves or updates a single content item in the appropriate chunk
 */
export async function saveContentToChunk(content: Content): Promise<void> {
  const chunksSnap = await getDocs(collection(db, 'content_chunks'));
  let targetDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  
  // 1. Check if item already exists in a chunk
  for (const doc of chunksSnap.docs) {
    const items = doc.data().items || {};
    if (items[content.id]) {
      targetDoc = doc;
      break;
    }
  }

  const batch = writeBatch(db);

  if (targetDoc) {
    // Update existing
    const docRef = targetDoc.ref;
    batch.update(docRef, {
      [`items.${content.id}`]: content,
      updatedAt: new Date().toISOString()
    });
  } else {
    // Add new - Find first chunk with space
    let foundSpace = false;
    const sortedDocs = [...chunksSnap.docs].sort((a, b) => a.id.localeCompare(b.id));
    
    for (const doc of sortedDocs) {
      const items = doc.data().items || {};
      if (Object.keys(items).length < CONTENT_CHUNK_SIZE) {
        batch.update(doc.ref, {
          [`items.${content.id}`]: content,
          updatedAt: new Date().toISOString()
        });
        foundSpace = true;
        break;
      }
    }

    if (!foundSpace) {
      // Create new chunk
      const nextId = `chunk_${chunksSnap.docs.length}`;
      const newRef = doc(db, 'content_chunks', nextId);
      batch.set(newRef, {
        items: { [content.id]: content },
        updatedAt: new Date().toISOString()
      });
    }
  }

  await batch.commit();
  await updateSyncMetadata();
}

/**
 * Saves multiple content items to chunks efficiently
 */
export async function saveContentsToChunks(contents: Content[]): Promise<void> {
  const chunksSnap = await getDocs(collection(db, 'content_chunks'));
  let currentChunks = chunksSnap.docs.map(d => ({ id: d.id, items: (d.data().items || {}) as Record<string, Content> }));
  
  const batch = writeBatch(db);
  const updatedChunkIds = new Set<string>();

  for (const content of contents) {
    let found = false;
    
    // 1. Try to update existing if present
    for (const chunk of currentChunks) {
      if (chunk.items[content.id]) {
        chunk.items[content.id] = content;
        updatedChunkIds.add(chunk.id);
        found = true;
        break;
      }
    }

    if (!found) {
      // 2. Add to first chunk with space
      let foundSpace = false;
      const sortedChunks = [...currentChunks].sort((a, b) => a.id.localeCompare(b.id));
      for (const chunk of sortedChunks) {
        if (Object.keys(chunk.items).length < CONTENT_CHUNK_SIZE) {
          chunk.items[content.id] = content;
          updatedChunkIds.add(chunk.id);
          foundSpace = true;
          break;
        }
      }

      if (!foundSpace) {
        // 3. Create new chunk
        const nextId = `chunk_${currentChunks.length}`;
        const newChunk = { id: nextId, items: { [content.id]: content } };
        currentChunks.push(newChunk);
        updatedChunkIds.add(nextId);
      }
    }
  }

  // Commit all affected chunks
  for (const chunkId of updatedChunkIds) {
    const chunk = currentChunks.find(c => c.id === chunkId);
    if (chunk) {
      batch.set(doc(db, 'content_chunks', chunkId), { 
        items: chunk.items,
        updatedAt: new Date().toISOString()
      });
    }
  }

  await batch.commit();
  await updateSyncMetadata();
}

/**
 * Repairs chunks by ensuring required fields like updatedAt are present and items are consistent.
 * Also performs any necessary cleanups.
 */
export async function repairChunks(
    onProgress?: (count: number) => void,
    localChunks?: Record<string, any>
): Promise<{ repaired: number, errors: number }> {
    console.log("Starting chunk repair process...");
    
    let repaired = 0;
    let errors = 0;
    const batch = writeBatch(db);
    let needsCommit = false;

    if (localChunks && Object.keys(localChunks).length > 0) {
        // Use provided local data for check
        for (const [id, data] of Object.entries(localChunks)) {
            let chunkNeedsUpdate = false;
            
            // Fix chunk itself
            if (!data.updatedAt) chunkNeedsUpdate = true;
            
            // Fix items
            const items = data.items || {};
            for (const [itemId, item] of Object.entries(items)) {
                if (!(item as any).id) {
                    (items[itemId] as any).id = itemId;
                    chunkNeedsUpdate = true;
                }
            }
            
            if (chunkNeedsUpdate) {
                batch.update(doc(db, 'content_chunks', id), {
                    items,
                    updatedAt: new Date().toISOString()
                });
                needsCommit = true;
                repaired++;
            }
            if (onProgress) onProgress(repaired);
        }
    } else {
        // Fallback to fetching fresh snapshot if no local data
        const chunksSnap = await getDocs(collection(db, 'content_chunks'));
        for (const chunkDoc of chunksSnap.docs) {
            const data = chunkDoc.data();
            let chunkNeedsUpdate = false;
            
            if (!data.updatedAt) chunkNeedsUpdate = true;
            
            const items = data.items || {};
            for (const [id, item] of Object.entries(items)) {
                if (!(item as any).id) {
                    (items[id] as any).id = id;
                    chunkNeedsUpdate = true;
                }
            }

            if (chunkNeedsUpdate) {
                batch.update(chunkDoc.ref, {
                    items,
                    updatedAt: new Date().toISOString()
                });
                needsCommit = true;
                repaired++;
            }
            if (onProgress) onProgress(repaired);
        }
    }

    if (needsCommit) {
        try {
            await batch.commit();
            await updateSyncMetadata();
        } catch (e) {
            console.error("Repair commit error:", e);
            errors = repaired;
            repaired = 0;
        }
    }

    console.log(`Repair finished. Repaired: ${repaired}, Errors: ${errors}`);
    return { repaired, errors };
}


/**
 * Deletes a content item from its chunk
 */
export async function deleteContentFromChunk(contentId: string): Promise<void> {
  const chunksSnap = await getDocs(collection(db, 'content_chunks'));
  
  for (const chunkDoc of chunksSnap.docs) {
    const items = chunkDoc.data().items || {};
    if (items[contentId]) {
      await updateDoc(chunkDoc.ref, {
        [`items.${contentId}`]: deleteField(),
        updatedAt: new Date().toISOString()
      });
      await updateSyncMetadata();
      return;
    }
  }
}

/**
 * Updates the search index chunks with a fresh list of entries
 */
export async function saveSearchIndexToChunks(entries: string[]): Promise<void> {
  const batch = writeBatch(db);
  
  // Clear old chunks first? Or just overwrite.
  // Overwriting is safer if we know the total shards.
  const shardsCount = Math.ceil(entries.length / SEARCH_CHUNK_SIZE);
  
  for (let i = 0; i < shardsCount; i++) {
    const start = i * SEARCH_CHUNK_SIZE;
    const end = start + SEARCH_CHUNK_SIZE;
    const chunkData = entries.slice(start, end);
    
    const docRef = doc(db, 'search_index_chunks', `shard_${i}`);
    batch.set(docRef, { 
      data: chunkData,
      updatedAt: new Date().toISOString()
    });
  }
  
  // Cleanup extra shards if any (e.g. if content decreased)
  const existingShards = await getDocs(collection(db, 'search_index_chunks'));
  existingShards.docs.forEach(d => {
    const index = parseInt(d.id.replace('shard_', ''), 10);
    if (index >= shardsCount) {
      batch.delete(d.ref);
    }
  });

  await batch.commit();
  await updateSyncMetadata();
}
