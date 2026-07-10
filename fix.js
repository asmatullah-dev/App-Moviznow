import fs from 'fs';
let content = fs.readFileSync('src/components/ContentFormModal.tsx', 'utf-8');
const searchStr = `
                                    <OfflineTranslateButton 
                                      text={ep.title}
                                      onTranslate={(val) => {
                                        const newSeasons = [...seasons];
                                        newSeasons[sIdx].episodes[eIdx].title = val;
                                        setSeasons(newSeasons);
                                      }}
                                      className="-ml-9 mr-2"
                                    />`;
content = content.replace(new RegExp(searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
fs.writeFileSync('src/components/ContentFormModal.tsx', content);
