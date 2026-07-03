const fs = require('fs');
const content = fs.readFileSync('src/pages/admin/ContentManagement.tsx', 'utf8');

const target = `        newDocId = Math.random().toString(36).substr(2, 9); // Generate a unique ID
        cleanedData.id = newDocId;
        cleanedData.createdAt = new Date().toISOString();
        cleanedData.addedBy = user?.uid;
        const maxOrder = Math.max(0, ...contentList.map((c) => c.order || 0));
        cleanedData.order = maxOrder + 1;
        await saveContent(cleanedData as Content);`;

const replacement = `        newDocId = Math.random().toString(36).substr(2, 9); // Generate a unique ID
        cleanedData.id = newDocId;
        cleanedData.createdAt = new Date().toISOString();
        cleanedData.addedBy = user?.uid;
        if (order !== "") {
          cleanedData.order = Number(order);
        } else {
          const maxOrder = Math.max(0, ...contentList.map((c) => c.order || 0));
          cleanedData.order = maxOrder + 1;
        }
        await saveContent(cleanedData as Content);`;

const newContent = content.replace(target, replacement);
fs.writeFileSync('src/pages/admin/ContentManagement.tsx', newContent);
