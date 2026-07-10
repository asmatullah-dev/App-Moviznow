import fs from 'fs';
let content = fs.readFileSync('src/components/ContentFormModal.tsx', 'utf-8');

// Revert import
content = content.replace("import { OfflineTranslateButton } from './OfflineTranslateButton';\n", "");

// Revert description
const descFind = `<div className="mt-1 relative">
                          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500 pr-8" placeholder="Enter description..." />
                          <div className="absolute right-1 top-1">
                            <OfflineTranslateButton text={description} onTranslate={setDescription} />
                          </div>
                        </div>`;
const descReplace = `<div className="mt-1">
                          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500" placeholder="Enter description..." />
                        </div>`;
content = content.replace(descFind, descReplace);

// Revert episode title
const titleFind = `<div className="flex-1 relative">
                                      <input
                                        type="text"
                                        value={ep.title}
                                        onChange={(e) => {
                                          const newSeasons = [...seasons];
                                          newSeasons[sIdx].episodes[eIdx].title = e.target.value;
                                          setSeasons(newSeasons);
                                        }}
                                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm pr-8"
                                        placeholder="Episode Title"
                                      />
                                      <div className="absolute right-1 top-1">
                                        <OfflineTranslateButton 
                                          text={ep.title}
                                          onTranslate={(val) => {
                                            const newSeasons = [...seasons];
                                            newSeasons[sIdx].episodes[eIdx].title = val;
                                            setSeasons(newSeasons);
                                          }}
                                        />
                                      </div>
                                    </div>`;
const titleReplace = `<input
                                      type="text"
                                      value={ep.title}
                                      onChange={(e) => {
                                        const newSeasons = [...seasons];
                                        newSeasons[sIdx].episodes[eIdx].title = e.target.value;
                                        setSeasons(newSeasons);
                                      }}
                                      className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm"
                                      placeholder="Episode Title"
                                    />`;
content = content.replace(titleFind, titleReplace);

// Revert episode description
const epDescFind = `<div className="mb-4 relative">
                                      <textarea
                                        value={ep.description || ''}
                                        onChange={(e) => {
                                          const newSeasons = [...seasons];
                                          newSeasons[sIdx].episodes[eIdx].description = e.target.value;
                                          setSeasons(newSeasons);
                                        }}
                                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm min-h-[80px] pr-8"
                                        placeholder="Episode Description..."
                                      />
                                      <div className="absolute right-1 top-1">
                                        <OfflineTranslateButton 
                                          text={ep.description || ''}
                                          onTranslate={(val) => {
                                            const newSeasons = [...seasons];
                                            newSeasons[sIdx].episodes[eIdx].description = val;
                                            setSeasons(newSeasons);
                                          }}
                                        />
                                      </div>
                                    </div>`;
const epDescReplace = `<div className="mb-4">
                                      <textarea
                                        value={ep.description || ''}
                                        onChange={(e) => {
                                          const newSeasons = [...seasons];
                                          newSeasons[sIdx].episodes[eIdx].description = e.target.value;
                                          setSeasons(newSeasons);
                                        }}
                                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm min-h-[80px]"
                                        placeholder="Episode Description..."
                                      />
                                    </div>`;
content = content.replace(epDescFind, epDescReplace);

fs.writeFileSync('src/components/ContentFormModal.tsx', content);
