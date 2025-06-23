import sys
import argparse
from pymongo import MongoClient
from wandb_utils import process_wandb_data, get_statistics


def connect_to_mongodb(mongo_uri):
    if not mongo_uri:
        print("MongoDB URI is required")
        return None
        
    try:
        client = MongoClient(mongo_uri)
        client.admin.command('ping')
        
        db = client.llm_debate
        collection = db.debates
        print("Connected to MongoDB")
        return collection
    except Exception as e:
        print(f"Error connecting to MongoDB: {e}")
        print("Make sure your MongoDB URI is correct and accessible")
        return None


def insert_to_mongodb(collection, data_list):
    if not data_list:
        print("No data to insert")
        return None
    
    try:
        result = collection.insert_many(data_list)
        print(f"Successfully inserted {len(result.inserted_ids)} documents into MongoDB")
        return result.inserted_ids
    except Exception as e:
        print(f"Error inserting data into MongoDB: {e}")
        return None


def get_mongo_uri(args):
    if args.mongo_uri:
        return args.mongo_uri    
    
    if sys.stdin.isatty():
        print("MongoDB URI is required. Please provide it using the --mongo-uri flag.")
        print('Example: --mongo-uri="mongodb://localhost:27017" or --mongo-uri="mongodb+srv://user:pass@cluster.mongodb.net/"')
        print()
    
    missing_deps = []
    try:
        import pymongo
    except ImportError:
        missing_deps.append("pymongo")
    
    try:
        import yaml
    except ImportError:
        missing_deps.append("PyYAML")
    
    if missing_deps:
        print("Missing required dependencies:")
        for dep in missing_deps:
            print(f"  - {dep}")
        print("\nInstall them using:")
        print(f"pip install {' '.join(missing_deps)}")
        return None
    
    return None


def print_statistics(stats):
    print(f"Total unique LLM configurations: {stats['unique_llm_configs']}")
    print(f"Records with wandb metadata: {stats['records_with_metadata']}/{stats['total_records']}")


def main():
    parser = argparse.ArgumentParser(description='Process wandb data and insert into MongoDB')
    parser.add_argument('--mongo-uri', '-m', 
                       help='MongoDB connection URI (e.g., "mongodb://localhost:27017")')
    parser.add_argument('--path', '-p', default='./wandb_data', 
                       help='Path to wandb data directory (default: ./wandb_data)')
    parser.add_argument('--dry-run', action='store_true',
                       help='Process data without inserting into database')
    
    args = parser.parse_args()
    
    print("Starting MongoDB Data Processing Script")
    print("=" * 50)
    
    wandb_data_path = args.path
    
    mongo_uri = None
    collection = None
    
    if not args.dry_run:
        mongo_uri = get_mongo_uri(args)
        if not mongo_uri:
            print("MongoDB URI is required.")
            print('Use: --mongo-uri="your_mongodb_connection_string"')
            print('Examples:')
            print('  --mongo-uri="mongodb://localhost:27017"')
            print('  --mongo-uri="mongodb+srv://user:pass@cluster.mongodb.net/"')
            sys.exit(1)

        collection = connect_to_mongodb(mongo_uri)
        if collection is None:
            sys.exit(1)
    else:
        print("Running in dry-run mode (no database insertion)")
    
    print(f"Processing wandb data from: {wandb_data_path}")
    processed_data = process_wandb_data(wandb_data_path)
    
    if not processed_data:
        print("⚠ No data found to process")
        return
    
    if not args.dry_run and collection is not None:
        inserted_ids = insert_to_mongodb(collection, processed_data)
        
        if inserted_ids:
            print("Data insertion completed successfully!")
    else:
        print("Data processing completed (dry run mode)")
    
    stats = get_statistics(processed_data)
    print_statistics(stats)
    
    print("Script execution completed!")


if __name__ == "__main__":
    main()