'use strict';

const fs = require('fs');
const web3 = new (require('web3'))();
const { HardhatPluginError } = require('hardhat/plugins');

const { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } = require('hardhat/builtin-tasks/task-names');

const removeX = function (input) {
  if (input.startsWith('0x')) {
    return input.substring(2);
  } else {
    return input;
  }
};

const hexify = function (input, prepend) {
  input = input.toLowerCase().trim();
  input = removeX(input);
  input = input.replace(/[^0-9a-f]/g, '');
  if (prepend) {
    input = '0x' + input;
  }
  return input;
};

const slotRegex = /precomputeslot\("([^"]+)"\)/i;
const slotHexRegex = /precomputeslothex\("([^"]+)"\)/i;
const keccak256Regex = /precomputekeccak256\("([^"]*)"\)/i;
const precomputeSlots = function (text) {
  let result, str, slot, index, keccak;
  while ((result = text.match(slotRegex))) {
    str = result[0];
    slot =
      '0x' +
      hexify(
        web3.utils.toHex(web3.utils.toBN(web3.utils.keccak256(result[1])).sub(web3.utils.toBN(1))),
        false
      ).padStart(64, '0');
    index = result.index;
    text = text.slice(0, index) + slot + text.slice(index + str.length);
  }
  while ((result = text.match(slotHexRegex))) {
    str = result[0];
    slot =
      'hex"' +
      hexify(
        web3.utils.toHex(web3.utils.toBN(web3.utils.keccak256(result[1])).sub(web3.utils.toBN(1))),
        false
      ).padStart(64, '0') + '"';
    index = result.index;
    text = text.slice(0, index) + slot + text.slice(index + str.length);
  }
  while((result = text.match(keccak256Regex))) {
    str = result[0];
    keccak = web3.utils.keccak256(result[1])
    index = result.index;
    text = text.slice(0, index) + keccak + text.slice(index + str.length);
  }
  return text;
};

const replaceValues = function (data, buildConfig, config) {
  data = precomputeSlots(data);
  Object.keys(buildConfig).forEach(function (key, index) {
    data = data.replace(new RegExp(buildConfig[key], 'gi'), config[key]);
  });
  return data;
};

const recursiveDelete = function (dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (let i = 0, l = files.length; i < l; i++) {
    if (files[i].isDirectory()) {
      recursiveDelete(dir + '/' + files[i].name);
      fs.rmdirSync(dir + '/' + files[i].name);
    } else {
      fs.unlinkSync(dir + '/' + files[i].name);
    }
  }
};

const recursiveBuild = function (sourceDir, deployDir, buildConfig, config, verbose) {
  const files = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (let i = 0, l = files.length; i < l; i++) {
    const file = files[i].name;
    if (files[i].isDirectory()) {
      fs.mkdirSync(deployDir + '/' + file);
      recursiveBuild(sourceDir + '/' + file, deployDir + '/' + file, buildConfig, config, verbose);
    } else {
      if (file.endsWith('.sol')) {
        if (verbose) {
          console.log(' -- building', file);
        }
        const data = fs.readFileSync(sourceDir + '/' + file, 'utf8');
        fs.writeFileSync(deployDir + '/' + file, replaceValues(data, buildConfig, config));
      } else {
        fs.copyFileSync(sourceDir + '/' + file, deployDir + '/' + file);
      }
    }
  }
};

task('holograph-build-contracts', 'Builds smart contracts in preparation for compiling.', async function (args, hre) {
  if (hre.config.hardhatHolographContractBuilder.verbose) {
    console.log('*** starting to build contracts from source ***');
  }
  const sourceDir = hre.config.paths.root + '/src';
  const deployDir = hre.config.paths.root + '/contracts';
  const { SOLIDITY_VERSION } = require(hre.config.paths.root + '/config/env');
  const buildConfig = JSON.parse(fs.readFileSync(hre.config.paths.root + '/config/build.config.json', 'utf8'));
  const license = fs.readFileSync(hre.config.paths.root + '/config/license', 'utf8');
  const version = 'pragma solidity ' + SOLIDITY_VERSION + ';';
  const config = Object.assign(
    {
      holographLicenseHeader: license,
      solidityCompilerVersion: version,
    },
    JSON.parse(fs.readFileSync(hre.config.paths.root + '/config/' + hre.network.name + '.config.json', 'utf8'))
  );

  recursiveDelete(deployDir);

  recursiveBuild(sourceDir, deployDir, buildConfig, config, hre.config.hardhatHolographContractBuilder.verbose);

  //     let sources = await hre.run (TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS, args);
  //     sources.forEach (function (absolutePath) {
  //         console.log (absolutePath);
  //     });

  if (hre.config.hardhatHolographContractBuilder.verbose) {
    console.log('*** finished building contracts from source ***');
  }
});
