const { extendConfig } = require('hardhat/config');

require('./tasks/compile.js');
require('./tasks/build_contracts.js');

extendConfig(function (config, userConfig) {
  config.hardhatHolographContractBuilder = Object.assign(
    {
      verbose: false,
      runOnCompile: false,
    },
    userConfig.hardhatHolographContractBuilder
  );
});
