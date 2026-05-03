import { Content } from '../types';
import { updateContentFieldsInChunks, repairChunkMetadata, rebuildAllChunks, saveSearchIndexToChunks } from './chunkUtils';
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

  // Update search index to ensure search and order stays consistent
  const published = memoryList.filter(c => c.status === 'published');
  
  let maxOrder = -1;
  published.forEach(c => {
    if (c.order !== undefined && c.order > maxOrder) maxOrder = c.order;
  });

  published.forEach(c => {
    if (c.order === undefined) {
      maxOrder++;
      c.order = maxOrder;
    }
  });

  published.sort((a, b) => (a.order || 0) - (b.order || 0));
  
  const index = published.map(c => {
    let seasonsInfoStr = '';
    if (c.type === 'series' && c.seasons) {
      try {
        const s = Array.isArray(c.seasons) ? c.seasons : JSON.parse(c.seasons as string);
        if (s.length > 1) {
          seasonsInfoStr = `S:${s.length}`;
        } else if (s.length === 1 && s[0].episodes) {
          seasonsInfoStr = `E:${s[0].episodes.length}`;
        }
      } catch(e) {}
    }
    return `${c.id}|${c.title}|${c.year}||${c.type}|${c.qualityId || ''}|${c.languageIds?.join(',') || ''}|${c.genreIds?.join(',') || ''}|${c.createdAt}|${c.order || 0}|${seasonsInfoStr}`;
  });

  await saveSearchIndexToChunks(index);
  
  const repairResult = await repairChunkMetadata();
  
  return { updatedCount, updatedItems, repairResult, newChunksCount };
}
