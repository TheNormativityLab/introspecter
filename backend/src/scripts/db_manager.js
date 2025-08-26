const { PrismaClient } = require('@prisma/client');
const { processWandbData, getStatistics } = require('./wandb_utils');
const { program } = require('commander');

class DatabaseManager {
  constructor() {
    this.prisma = null;
  }

  async connectToPostgreSQL(databaseUrl) {
    if (!databaseUrl) {
      console.log('Database URL is required');
      return null;
    }

    try {
      this.prisma = new PrismaClient({
        datasources: {
          db: {
            url: databaseUrl,
          },
        },
      });

      await this.prisma.$connect();
      console.log('Connected to PostgreSQL');
      return this.prisma;
    } catch (error) {
      console.error(`Error connecting to PostgreSQL: ${error.message}`);
      console.log('Make sure your DATABASE_URL is correct and accessible');
      return null;
    }
  }

  async disconnect() {
    if (this.prisma) {
      try {
        await this.prisma.$disconnect();
        console.log('Disconnected from PostgreSQL');
      } catch (error) {
        console.error(`Error disconnecting from PostgreSQL: ${error.message}`);
      }
    }
  }

  cleanData(obj) {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (typeof obj === 'string') {
      return obj.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.cleanData(item));
    }
    
    if (typeof obj === 'object') {
      const cleaned = {};
      for (const [key, value] of Object.entries(obj)) {
        cleaned[key] = this.cleanData(value);
      }
      return cleaned;
    }
    
    return obj;
  }

  async insertToPostgreSQL(dataList) {
    if (!dataList || dataList.length === 0) {
      console.log('No data to insert');
      return null;
    }

    try {
      let insertedCount = 0;
      let errorCount = 0;

      for (const data of dataList) {
        try {
          const cleanedData = this.cleanData(data);
          const llmConfigIds = [];
          
          for (const llmConfig of cleanedData.modelConfig.LLM) {
            const existingConfig = await this.prisma.llmConfig.findFirst({
              where: {
                modelName: llmConfig.model_name || '',
                model: llmConfig.model || '',
              },
            });

            if (existingConfig) {
              llmConfigIds.push(existingConfig.id);
            } else {
              const newConfig = await this.prisma.llmConfig.create({
                data: {
                  modelName: llmConfig.model_name || '',
                  model: llmConfig.model || '',
                  apiBase: llmConfig.api_base || null,
                  timeout: llmConfig.timeout || 300,
                  numRetries: llmConfig.num_retries || 5,
                  rpm: llmConfig.rpm || null,
                  topP: llmConfig.top_p || null,
                  maxTokens: llmConfig.max_tokens || null,
                  temperature: llmConfig.temperature || null,
                },
              });
              llmConfigIds.push(newConfig.id);
            }
          }

          let processedAt = new Date();
          if (cleanedData.processed_at) {
            if (cleanedData.processed_at instanceof Date) {
              processedAt = cleanedData.processed_at;
            } else if (typeof cleanedData.processed_at === 'string') {
              processedAt = new Date(cleanedData.processed_at);
            } else if (typeof cleanedData.processed_at === 'number') {
              processedAt = new Date(cleanedData.processed_at);
            }
          }

          const debateData = {
            status: cleanedData.status || 'completed',
            performanceData: cleanedData.performance_data,
            resultData: cleanedData.result_data,
            wandbMetadata: cleanedData.wandb_metadata,
            processedAt: processedAt,
            llmConfigs: {
              connect: llmConfigIds.map(id => ({ id })),
            },
          };

          if (cleanedData.current_seed !== null && cleanedData.current_seed !== undefined) {
            debateData.seed = cleanedData.current_seed;
          }

          if (cleanedData.dataset_name !== null && cleanedData.dataset_name !== undefined) {
            debateData.datasetName = cleanedData.dataset_name;
          }

          await this.prisma.debate.create({
            data: debateData,
          });

          insertedCount++;
        } catch (recordError) {
          errorCount++;
          console.error(`Error inserting record ${insertedCount + errorCount}: ${recordError.message}`);
          continue;
        }
      }

      console.log(`Successfully inserted ${insertedCount} records into PostgreSQL`);
      if (errorCount > 0) {
        console.log(`Failed to insert ${errorCount} records due to data issues`);
      }
      return insertedCount;
    } catch (error) {
      console.error(`Error inserting data into PostgreSQL: ${error.message}`);
      return null;
    }
  }
}

function getDatabaseUrl(options) {
  if (options.databaseUrl) {
    return options.databaseUrl;
  }

  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  if (process.stdin.isTTY) {
    console.log('Database URL is required. Please provide it using the --database-url flag or DATABASE_URL environment variable.');
    console.log('Example: --database-url="postgresql://user:password@localhost:5432/dbname"');
    console.log('Or set: DATABASE_URL="postgresql://user:password@localhost:5432/dbname"');
    console.log('');
  }
  const missingDeps = [];
  
  try {
    require('@prisma/client');
  } catch (error) {
    missingDeps.push('@prisma/client');
  }

  try {
    require('js-yaml');
  } catch (error) {
    missingDeps.push('js-yaml');
  }

  if (missingDeps.length > 0) {
    console.log('Missing required dependencies:');
    missingDeps.forEach(dep => console.log(`  - ${dep}`));
    console.log('\nInstall them using:');
    console.log(`npm install ${missingDeps.join(' ')}`);
    return null;
  }

  return null;
}

function printStatistics(stats) {
  console.log(`Total unique LLM configurations: ${stats.uniqueLlmConfigs}`);
  console.log(`Records with wandb metadata: ${stats.recordsWithMetadata}/${stats.totalRecords}`);
  console.log(`Records with seed values: ${stats.recordsWithSeed}/${stats.totalRecords}`);
}

async function main() {
  program
    .name('db-manager')
    .description('Process wandb data and insert into PostgreSQL')
    .option('-d, --database-url <url>', 'PostgreSQL connection URL')
    .option('-p, --path <path>', 'Path to wandb data directory', '../../wandb_data')
    .option('--dry-run', 'Process data without inserting into database')
    .allowUnknownOption()
    .parse();

  const options = program.opts();

  console.log('Starting PostgreSQL Data Processing Script');
  console.log('='.repeat(50));

  const wandbDataPath = options.path;
  const dbManager = new DatabaseManager();

  let databaseUrl = null;
  let db = null;

  if (!options.dryRun) {
    databaseUrl = getDatabaseUrl(options);
    if (!databaseUrl) {
      console.log('Database URL is required.');
      console.log('Use: --database-url="your_postgresql_connection_string"');
      console.log('Examples:');
      console.log('  --database-url="postgresql://user:password@localhost:5432/dbname"');
      console.log('  --database-url="postgresql://user:password@host:5432/dbname?sslmode=require"');
      process.exit(1);
    }

    db = await dbManager.connectToPostgreSQL(databaseUrl);
    if (db === null) {
      process.exit(1);
    }
  } else {
    console.log('Running in dry-run mode (no database insertion)');
  }

  console.log(`Processing wandb data from: ${wandbDataPath}`);
  const processedData = processWandbData(wandbDataPath);

  if (!processedData || processedData.length === 0) {
    console.log('⚠ No data found to process');
    await dbManager.disconnect();
    return;
  }

  if (!options.dryRun && db !== null) {
    const insertedCount = await dbManager.insertToPostgreSQL(processedData);

    if (insertedCount) {
      console.log('Data insertion completed successfully!');
    }

    await dbManager.disconnect();
  } else {
    console.log('Data processing completed (dry run mode)');
  }

  const stats = getStatistics(processedData);
  printStatistics(stats);

  console.log('Script execution completed!');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { DatabaseManager };