import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  entries: [
    'src/index',
    'src/nestjs/index',
    'src/infrastructure/index',
    'src/cli',
  ],
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: true,
    inlineDependencies: false,
  },
  externals: ['ts-morph', 'jiti'],
});
