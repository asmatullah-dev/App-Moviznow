const fs = require('fs');
const content = fs.readFileSync('src/contexts/ContentContext.tsx', 'utf8');

const target = `    if (!chunkId) return item;
    try {
      const chunkStr = safeStorage.getItem('content_chunk_' + chunkId);
      if (chunkStr) {
         const items = JSON.parse(chunkStr);
         if (items[id]) {
            const expanded = expandContent({ ...items[id], id }, chunkId);
            expanded.order = item.order;
            return expanded;
         }
      }
    } catch(e) {}
    return item;`;

const replacement = `    if (!chunkId) return item;
    try {
      let chunkStr = safeStorage.getItem('content_chunk_' + chunkId);
      if (!chunkStr) {
         const chunkDoc = await getDoc(doc(db, 'content_chunks', chunkId));
         if (chunkDoc.exists()) {
             const items = chunkDoc.data().items || {};
             chunkStr = JSON.stringify(items);
             safeStorage.setItem('content_chunk_' + chunkId, chunkStr);
         }
      }
      if (chunkStr) {
         const items = JSON.parse(chunkStr);
         if (items[id]) {
            const expanded = expandContent({ ...items[id], id }, chunkId);
            expanded.order = item.order;
            return expanded;
         }
      }
    } catch(e) {
      console.error("Failed to fetch chunk on demand:", e);
    }
    return item;`;

if (content.includes(target)) {
    fs.writeFileSync('src/contexts/ContentContext.tsx', content.replace(target, replacement));
    console.log("Patched successfully");
} else {
    console.log("Target not found!");
}
