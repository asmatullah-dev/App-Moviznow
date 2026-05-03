import { Content } from '../types';
import { updateContentFieldsInChunks, repairChunkMetadata, rebuildAllChunks } from './chunkUtils';
import { safeStorage } from './safeStorage';

export async function checkAndUpdateChunksLocal(contentList: Content[]): Promise<{updatedCount: number, updatedItems: {id: string, [key: string]: any}[]}> {
  let updatedCount = 0;
  const updates: {id: string, [key: string]: any}[] = [];

  contentList.forEach(item => {
    let needsUpdate = false;
    const updatePayload: {id: string, [key: string]: any} = { id: item.id };

    // Check for missing updatedAt
    if (!item.updatedAt) {
      updatePayload.updatedAt = item.createdAt || new Date().toISOString();
      needsUpdate = true;
    }

    if (needsUpdate) {
      updates.push(updatePayload);
      updatedCount++;
    }
  });

  return { updatedCount, updatedItems: updates };
}

export async function processChunkMaintenance(contentList: Content[], executeSync = false) {
  if (!executeSync) {
    const { updatedCount, updatedItems } = await checkAndUpdateChunksLocal(contentList);
    return { updatedCount, updatedItems, repairResult: null };
  }

  // Check if anything needs updating locally
  const { updatedCount, updatedItems } = await checkAndUpdateChunksLocal(contentList);

  // Apply updates to list in-memory first so we rebuild with correct data
  const memoryList = [...contentList];
  if (updatedCount > 0) {
    const map = new Map(updatedItems.map(i => [i.id, i]));
    for (let i = 0; i < memoryList.length; i++) {
        if (map.has(memoryList[i].id)) {
            memoryList[i] = { ...memoryList[i], ...map.get(memoryList[i].id) } as Content;
        }
    }
  }

  // Rebuild chunks (extract in locally then create chunks separately)
  const newChunksCount = await rebuildAllChunks(memoryList);

  const repairResult = await repairChunkMetadata();
  
  return { updatedCount, updatedItems, repairResult, newChunksCount };
}
