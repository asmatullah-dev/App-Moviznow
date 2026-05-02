import { Content } from '../types';
import { updateContentFieldsInChunks, repairChunkMetadata } from './chunkUtils';
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
  // 1. Repair Metadata first
  let repairResult = null;
  if (executeSync) {
    repairResult = await repairChunkMetadata();
  }

  // 2. Check for missing fields
  const { updatedCount, updatedItems } = await checkAndUpdateChunksLocal(contentList);
  
  if (updatedCount > 0 && executeSync) {
    console.log(`Maintenance: Found ${updatedCount} items needing updates. Updating chunks...`);
    await updateContentFieldsInChunks(updatedItems);
  }
  
  return { updatedCount, updatedItems, repairResult };
}
