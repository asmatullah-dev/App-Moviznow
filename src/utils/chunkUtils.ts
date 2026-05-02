import { doc, getDoc, getDocs, collection, writeBatch, setDoc, updateDoc, deleteField, QueryDocumentSnapshot, DocumentData, WriteBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Content } from '../types';

export const CONTENT_CHUNK_SIZE = 100; 
export const SEARCH_CHUNK_SIZE = 1000; 

function registerChunkUpdates(chunkIds: string[], batch: WriteBatch) {
  const metaRef = doc(db, 'chunk_meta', 'versions');
  const updates: Record<string, number> = {};
  chunkIds.forEach(id => {
    updates[id] = Date.now();
  });
  batch.set(metaRef, updates, { merge: true });
}

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
      [`items.${content.id}`]: content
    });
    registerChunkUpdates([targetDoc.id], batch);
  } else {
    // Add new - Find first chunk with space
    let foundSpace = false;
    const sortedDocs = [...chunksSnap.docs].sort((a, b) => a.id.localeCompare(b.id));
    
    for (const doc of sortedDocs) {
      const items = doc.data().items || {};
      if (Object.keys(items).length < CONTENT_CHUNK_SIZE) {
        batch.update(doc.ref, {
          [`items.${content.id}`]: content
        });
        registerChunkUpdates([doc.id], batch);
        foundSpace = true;
        break;
      }
    }

    if (!foundSpace) {
      // Create new chunk
      const nextId = `chunk_${chunksSnap.docs.length}`;
      const newRef = doc(db, 'content_chunks', nextId);
      batch.set(newRef, {
        items: { [content.id]: content }
      });
      registerChunkUpdates([nextId], batch);
    }
  }

  await batch.commit();
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
      batch.set(doc(db, 'content_chunks', chunkId), { items: chunk.items });
    }
  }

  registerChunkUpdates(Array.from(updatedChunkIds), batch);

  await batch.commit();
}

/**
 * Updates specific fields for multiple content items in their respective chunks
 */
export async function updateContentFieldsInChunks(updates: { id: string, [key: string]: any }[]): Promise<void> {
  const chunksSnap = await getDocs(collection(db, 'content_chunks'));
  
  // We may need multiple batches if updates exceed 500
  let batches = [writeBatch(db)];
  let operationCount = 0;
  
  const chunkUpdatesByBatch: Set<string>[] = [new Set()];

  for (const updateObj of updates) {
    const contentId = updateObj.id;
    for (const chunkDoc of chunksSnap.docs) {
      const items = chunkDoc.data().items || {};
      if (items[contentId]) {
        const docUpdates: Record<string, any> = {};
        for (const [key, value] of Object.entries(updateObj)) {
          if (key !== 'id') {
            docUpdates[`items.${contentId}.${key}`] = value;
          }
        }
        
        if (operationCount >= 490) {
          batches.push(writeBatch(db));
          chunkUpdatesByBatch.push(new Set());
          operationCount = 0;
        }
        
        batches[batches.length - 1].update(chunkDoc.ref, docUpdates);
        chunkUpdatesByBatch[batches.length - 1].add(chunkDoc.id);
        operationCount++;
        break;
      }
    }
  }

  for (let i = 0; i < batches.length; i++) {
    if (chunkUpdatesByBatch[i].size > 0) {
      registerChunkUpdates(Array.from(chunkUpdatesByBatch[i]), batches[i]);
    }
  }

  await Promise.all(batches.map(b => b.commit()));
}


/**
 * Deletes a content item from its chunk
 */
export async function deleteContentFromChunk(contentId: string): Promise<void> {
  return deleteContentsFromChunks([contentId]);
}

/**
 * Deletes multiple content items from chunks efficiently
 */
export async function deleteContentsFromChunks(contentIds: string[]): Promise<void> {
  const chunksSnap = await getDocs(collection(db, 'content_chunks'));
  
  let batches = [writeBatch(db)];
  let operationCount = 0;
  const chunkUpdatesByBatch: Set<string>[] = [new Set()];

  for (const chunkDoc of chunksSnap.docs) {
    const items = chunkDoc.data().items || {};
    let chunkHasDeletes = false;
    const docUpdates: Record<string, any> = {};

    for (const id of contentIds) {
      if (items[id]) {
        docUpdates[`items.${id}`] = deleteField();
        chunkHasDeletes = true;
      }
    }

    if (chunkHasDeletes) {
      if (operationCount >= 490) {
        batches.push(writeBatch(db));
        chunkUpdatesByBatch.push(new Set());
        operationCount = 0;
      }
      batches[batches.length - 1].update(chunkDoc.ref, docUpdates);
      chunkUpdatesByBatch[batches.length - 1].add(chunkDoc.id);
      operationCount++;
    }
  }

  for (let i = 0; i < batches.length; i++) {
    if (chunkUpdatesByBatch[i].size > 0) {
      registerChunkUpdates(Array.from(chunkUpdatesByBatch[i]), batches[i]);
    }
  }

  await Promise.all(batches.map(b => b.commit()));
}

export async function getContentFromChunks(contentId: string): Promise<Content | null> {
  const chunksSnap = await getDocs(collection(db, 'content_chunks'));
  
  for (const chunkDoc of chunksSnap.docs) {
    const items = chunkDoc.data().items || {};
    if (items[contentId]) {
      return items[contentId] as Content;
    }
  }
  return null;
}

/**
 * Scans all chunks in Firestore and ensures chunk_meta/versions is up to date
 */
export async function repairChunkMetadata(): Promise<{ repairedContent: number, repairedSearch: number }> {
  const batch = writeBatch(db);
  const now = Date.now();

  // 1. Repair content_chunks
  const contentSnap = await getDocs(collection(db, 'content_chunks'));
  const contentVersions: Record<string, number> = {};
  contentSnap.docs.forEach(d => {
    contentVersions[d.id] = now;
  });
  batch.set(doc(db, 'chunk_meta', 'versions'), contentVersions);

  // 2. Repair search_index_chunks
  const searchSnap = await getDocs(collection(db, 'search_index_chunks'));
  const searchVersions: Record<string, number> = {};
  searchSnap.docs.forEach(d => {
    searchVersions[d.id] = now;
  });
  batch.set(doc(db, 'chunk_meta', 'search_index_versions'), searchVersions);

  await batch.commit();
  return { 
    repairedContent: contentSnap.size, 
    repairedSearch: searchSnap.size 
  };
}

function registerSearchIndexUpdates(shardIds: string[], batch: WriteBatch) {
  const metaRef = doc(db, 'chunk_meta', 'search_index_versions');
  const updates: Record<string, number> = {};
  shardIds.forEach(id => {
    updates[id] = Date.now();
  });
  batch.set(metaRef, updates, { merge: true });
}

/**
 * Updates the search index chunks with a fresh list of entries
 */
export async function saveSearchIndexToChunks(entries: string[]): Promise<void> {
  const batch = writeBatch(db);
  
  // Clear old chunks first? Or just overwrite.
  // Overwriting is safer if we know the total shards.
  const shardsCount = Math.ceil(entries.length / SEARCH_CHUNK_SIZE);
  const updatedShardIds: string[] = [];
  
  for (let i = 0; i < shardsCount; i++) {
    const start = i * SEARCH_CHUNK_SIZE;
    const end = start + SEARCH_CHUNK_SIZE;
    const chunkData = entries.slice(start, end);
    const shardId = `shard_${i}`;
    
    const docRef = doc(db, 'search_index_chunks', shardId);
    batch.set(docRef, { data: chunkData });
    updatedShardIds.push(shardId);
  }
  
  // Cleanup extra shards if any (e.g. if content decreased)
  const existingShards = await getDocs(collection(db, 'search_index_chunks'));
  existingShards.docs.forEach(d => {
    const index = parseInt(d.id.replace('shard_', ''), 10);
    if (index >= shardsCount) {
      batch.delete(d.ref);
    }
  });

  registerSearchIndexUpdates(updatedShardIds, batch);

  await batch.commit();
}
