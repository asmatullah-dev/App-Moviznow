import fs from 'fs';
let content = fs.readFileSync('src/components/ContentFormModal.tsx', 'utf-8');

// Replace episode title
content = content.replace(
`                                    <input
                                      type="text"
                                      value={ep.title}
                                      onChange={(e) => {
                                        const newSeasons = [...seasons];
                                        newSeasons[sIdx].episodes[eIdx].title = e.target.value;
                                        setSeasons(newSeasons);
                                      }}
                                      className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm"
                                      placeholder="Episode Title"
                                    />`,
`                                    <div className="flex-1 relative">
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
                                    </div>`
);

// Replace episode description
content = content.replace(
`                                  {expandedEpisodes[ep.id] && (
                                    <div className="mb-4">
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
                                    </div>
                                  )}`,
`                                  {expandedEpisodes[ep.id] && (
                                    <div className="mb-4 relative">
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
                                    </div>
                                  )}`
);

fs.writeFileSync('src/components/ContentFormModal.tsx', content);
