function mergeContracts(...sources) {
  const merged = {};
  for (const source of sources) {
    if (source) Object.assign(merged, source);
  }
  return merged;
}

export { mergeContracts as m };
