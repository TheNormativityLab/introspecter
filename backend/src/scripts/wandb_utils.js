const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function loadJsonFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.log(`✗ Error loading ${filePath}: ${error.message}`);
    return null;
  }
}

function loadYamlFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return yaml.load(data);
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log('js-yaml not found. Please install it using: npm install js-yaml');
    } else {
      console.log(`Error loading ${filePath}: ${error.message}`);
    }
    return null;
  }
}

function isIntegerFolder(folderName) {
  const num = parseInt(folderName, 10);
  return !isNaN(num) && num.toString() === folderName;
}

function findJsonFiles(integerFolderPath) {
  let performanceFile = null;
  let resultFile = null;

  try {
    const files = fs.readdirSync(integerFolderPath);
    
    for (const file of files) {
      if (file.endsWith('_performance.json')) {
        performanceFile = path.join(integerFolderPath, file);
      } else if (file.endsWith('_result.json')) {
        resultFile = path.join(integerFolderPath, file);
      }
    }
  } catch (error) {
    console.log(`Error reading directory ${integerFolderPath}: ${error.message}`);
  }

  return { performanceFile, resultFile };
}

function findConfigFile(subfolderPath) {
  const configPath = path.join(subfolderPath, 'config.yaml');
  return fs.existsSync(configPath) ? configPath : null;
}

function findWandbMetadataFile(subfolderPath) {
  const metadataPath = path.join(subfolderPath, 'wandb-metadata.json');
  return fs.existsSync(metadataPath) ? metadataPath : null;
}

function parseLlmStringWithEval(llmStr) {
  try {
    let cleanedStr = llmStr.replace(/\$\{oc\.env:[^}]+\}/g, '""');
    cleanedStr = cleanedStr.replace(/\$\{[^}]+\}/g, '""');
    const result = eval(`(${cleanedStr})`);
    return result;
  } catch (error) {
    console.log(`Error parsing LLM string: ${error.message}`);
    return null;
  }
}

function extractModelConfig(model, llmConfig) {
  const litellmParams = model.litellm_params || {};
  const completionParams = llmConfig.completion_params || {};

  const modelConfig = {
    model_name: model.model_name || '',
    model: litellmParams.model || '',
    api_base: litellmParams.api_base || '',
    timeout: litellmParams.timeout || 300,
    num_retries: litellmParams.num_retries || 5,
    rpm: litellmParams.rpm || null,
    top_p: completionParams.top_p || null,
    max_tokens: completionParams.max_tokens || null,
    temperature: completionParams.temperature || null,
  };

  const filteredConfig = {};
  for (const [key, value] of Object.entries(modelConfig)) {
    if (value !== null) {
      filteredConfig[key] = value;
    }
  }

  return filteredConfig;
}

function extractSeedFromConfig(configData) {
  if (configData.seed && configData.seed.value !== undefined) {
    const seedValue = configData.seed.value;
    if (typeof seedValue === 'number') {
      return seedValue;
    } else if (typeof seedValue === 'string') {
      const parsedSeed = parseInt(seedValue, 10);
      if (!isNaN(parsedSeed)) {
        return parsedSeed;
      }
    }
  }
  
  if (configData.seed !== undefined && typeof configData.seed === 'number') {
    return configData.seed;
  }
  
  if (configData.defaults && configData.defaults.seed && configData.defaults.seed.value !== undefined) {
    return configData.defaults.seed.value;
  }
  
  if (configData.hydra && configData.hydra.job && configData.hydra.job.override_dirname) {
    const overrideParts = configData.hydra.job.override_dirname.split(',');
    for (const part of overrideParts) {
      if (part.includes('seed=')) {
        const seedValue = part.split('seed=')[1];
        const parsedSeed = parseInt(seedValue, 10);
        if (!isNaN(parsedSeed)) {
          return parsedSeed;
        }
      }
    }
  }
  
  if (configData.run && configData.run.seed && configData.run.seed.value !== undefined) {
    return configData.run.seed.value;
  }
  
  if (configData.experiment && configData.experiment.seed && configData.experiment.seed.value !== undefined) {
    return configData.experiment.seed.value;
  }
  
  return null;
}

function extractDatasetFromConfig(configData) {
  if (configData.task && configData.task.value !== undefined) {
    const taskValue = configData.task.value;
    
    if (typeof taskValue === 'string') {
      try {
        let cleanedStr = taskValue.replace(/'/g, '"');
        const taskConfig = JSON.parse(cleanedStr);
        
        if (taskConfig.name) {
          return taskConfig.name;
        }
      } catch (error) {
        const nameMatch = taskValue.match(/'name':\s*'([^']+)'/);
        if (nameMatch && nameMatch[1]) {
          return nameMatch[1];
        }
      }
    }
    
    if (typeof taskValue === 'object' && taskValue !== null && taskValue.name) {
      return taskValue.name;
    }
  }
  
  if (configData.task && typeof configData.task === 'object' && configData.task.name) {
    return configData.task.name;
  }
  
  if (configData.defaults && configData.defaults.task && configData.defaults.task.value) {
    const taskValue = configData.defaults.task.value;
    if (typeof taskValue === 'string') {
      try {
        let cleanedStr = taskValue.replace(/'/g, '"');
        const taskConfig = JSON.parse(cleanedStr);
        if (taskConfig.name) {
          return taskConfig.name;
        }
      } catch (error) {
        const nameMatch = taskValue.match(/'name':\s*'([^']+)'/);
        if (nameMatch && nameMatch[1]) {
          return nameMatch[1];
        }
      }
    }
  }
  
  return null;
}

function parseLlmConfigs(configData) {
  const llmConfigs = [];
  const llmKeys = ['llm1', 'llm2', 'llm3'];

  for (const llmKey of llmKeys) {
    if (llmKey in configData) {
      const llmData = configData[llmKey];

      let llmStr;
      if (typeof llmData === 'object' && llmData !== null && 'value' in llmData) {
        llmStr = llmData.value;
      } else {
        continue;
      }

      try {
        const llmConfig = parseLlmStringWithEval(llmStr);

        if (llmConfig && 
            typeof llmConfig === 'object' && 
            'language_models' in llmConfig) {
          
          for (const model of llmConfig.language_models) {
            const modelConfig = extractModelConfig(model, llmConfig);
            llmConfigs.push(modelConfig);
          }
        }
      } catch (error) {
        console.log(`⚠ Error parsing ${llmKey} config: ${error.message}`);
      }
    }
  }

  return llmConfigs;
}

function getLlmConfigKey(llmConfig) {
  return `${llmConfig.model_name || ''}|${llmConfig.model || ''}`;
}

function removeDuplicateLlmConfigs(llmConfigs) {
  const seenConfigs = new Set();
  const uniqueConfigs = [];

  for (const config of llmConfigs) {
    const configKey = getLlmConfigKey(config);
    if (!seenConfigs.has(configKey)) {
      seenConfigs.add(configKey);
      uniqueConfigs.push(config);
    }
  }

  return uniqueConfigs;
}

function processWandbMetadata(metadataData) {
  if (!metadataData) {
    return {};
  }

  const processedMetadata = {
    startedAt: metadataData.startedAt || '',
  };

  const argsDict = {};
  if (metadataData.args && Array.isArray(metadataData.args)) {
    for (const arg of metadataData.args) {
      if (arg.includes('=')) {
        const [key, ...valueParts] = arg.split('=');
        let value = valueParts.join('=');

        if (/^\d+$/.test(value)) {
          value = parseInt(value, 10);
        } else if (/^\d+\.\d+$/.test(value)) {
          value = parseFloat(value);
        } else if (value.toLowerCase() === 'true') {
          value = true;
        } else if (value.toLowerCase() === 'false') {
          value = false;
        }
        argsDict[key] = value;
      }
    }
  }

  processedMetadata.parsed_args = argsDict;
  return processedMetadata;
}

function processWandbData(wandbDataPath) {
  const results = [];

  if (!fs.existsSync(wandbDataPath)) {
    console.log(`Path ${wandbDataPath} does not exist`);
    return results;
  }

  let totalProcessed = 0;

  try {
    const subfolders = fs.readdirSync(wandbDataPath);

    for (const subfolder of subfolders) {
      const subfolderPath = path.join(wandbDataPath, subfolder);

      if (!fs.statSync(subfolderPath).isDirectory()) {
        continue;
      }

      const configFile = findConfigFile(subfolderPath);
      let configData = null;
      let llmConfigs = [];
      let currentSeed = null;
      let datasetName = null;

      if (configFile) {
        configData = loadYamlFile(configFile);
        if (configData) {
          llmConfigs = parseLlmConfigs(configData);
          llmConfigs = removeDuplicateLlmConfigs(llmConfigs);
          currentSeed = extractSeedFromConfig(configData);
          datasetName = extractDatasetFromConfig(configData);
        }
      }

      const metadataFile = findWandbMetadataFile(subfolderPath);
      let metadataData = null;
      let processedMetadata = {};

      if (metadataFile) {
        metadataData = loadJsonFile(metadataFile);
        if (metadataData) {
          processedMetadata = processWandbMetadata(metadataData);
        }
      }

      const items = fs.readdirSync(subfolderPath);

      for (const item of items) {
        const itemPath = path.join(subfolderPath, item);

        if (fs.statSync(itemPath).isDirectory() && isIntegerFolder(item)) {
          const { performanceFile, resultFile } = findJsonFiles(itemPath);

          if (!performanceFile || !resultFile) {
            continue;
          }

          const performanceData = loadJsonFile(performanceFile);
          const resultData = loadJsonFile(resultFile);

          if (performanceData === null || resultData === null) {
            continue;
          }

          const combinedData = {
            status: 'completed',
            performance_data: performanceData,
            result_data: resultData,
            modelConfig: {
              LLM: llmConfigs,
              Human: [],
            },
            wandb_metadata: processedMetadata,
            current_seed: currentSeed,
            dataset_name: datasetName,
            processed_at: new Date(),
          };

          results.push(combinedData);
          totalProcessed++;
        }
      }
    }
  } catch (error) {
    console.error(`Error processing wandb data: ${error.message}`);
  }

  console.log(`Processing ${totalProcessed} records...`);
  return results;
}

function getStatistics(processedData) {
  if (!processedData || processedData.length === 0) {
    return {};
  }

  const allLlmConfigs = [];
  const seedCounts = {};
  const datasetCounts = {};
  let recordsWithSeed = 0;
  let recordsWithDataset = 0;

  for (const data of processedData) {
    allLlmConfigs.push(...data.modelConfig.LLM);
    
    if (data.current_seed !== null) {
      recordsWithSeed++;
      const seed = data.current_seed.toString();
      seedCounts[seed] = (seedCounts[seed] || 0) + 1;
    }
    
    if (data.dataset_name !== null) {
      recordsWithDataset++;
      const dataset = data.dataset_name;
      datasetCounts[dataset] = (datasetCounts[dataset] || 0) + 1;
    }
  }

  const uniqueLlmConfigs = removeDuplicateLlmConfigs(allLlmConfigs);
  const metadataCount = processedData.filter(data => data.wandb_metadata).length;

  return {
    totalRecords: processedData.length,
    uniqueLlmConfigs: uniqueLlmConfigs.length,
    recordsWithMetadata: metadataCount,
    recordsWithSeed: recordsWithSeed,
    uniqueSeeds: Object.keys(seedCounts).length,
    seedDistribution: seedCounts,
    recordsWithDataset: recordsWithDataset,
    uniqueDatasets: Object.keys(datasetCounts).length,
    datasetDistribution: datasetCounts,
  };
}

module.exports = {
  loadJsonFile,
  loadYamlFile,
  isIntegerFolder,
  findJsonFiles,
  findConfigFile,
  findWandbMetadataFile,
  parseLlmStringWithEval,
  extractModelConfig,
  extractSeedFromConfig,
  extractDatasetFromConfig,
  parseLlmConfigs,
  getLlmConfigKey,
  removeDuplicateLlmConfigs,
  processWandbMetadata,
  processWandbData,
  getStatistics,
};