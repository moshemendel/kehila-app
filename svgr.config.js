// react-native-svg-transformer runs every .svg import through SVGR/SVGO at
// bundle time. SVGO's preset-default includes `mergePaths` and
// `collapseGroups`, which silently merge/drop paths in our auto-vectorized,
// multi-color icon set (hundreds of flat, unlabeled <path> elements) —
// verified to collapse a 16-path icon down to 6 and visibly break the
// artwork. Disabling those specific optimizations keeps every path intact.
module.exports = {
  svgoConfig: {
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            inlineStyles: { onlyMatchedOnce: false },
            removeViewBox: false,
            removeUnknownsAndDefaults: false,
            convertColors: false,
            mergePaths: false,
            collapseGroups: false,
            convertShapeToPath: false,
          },
        },
      },
    ],
  },
};
