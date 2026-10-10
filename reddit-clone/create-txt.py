import os
import subprocess

IGNORED_DIRS = {"node_modules", ".next", ".env", "logs"}
IGNORED_EXTENSIONS = {".svg"}
IGNORED_FILES = {"package-lock.json", "NOTES.txt", "subreddits.txt", "project.txt", "LICENSE", "README.md"}

TEXT_EXTENSIONS = {
    ".txt", ".md", ".py", ".js", ".ts", ".jsx", ".tsx",
    ".json", ".html", ".css", ".scss", ".yaml", ".yml",
    ".toml", ".env.example", ".env", ".js"
}

def is_text_file(path):
    _, ext = os.path.splitext(path)
    if os.path.basename(path) in IGNORED_FILES:
        return False
    if ext.lower() in IGNORED_EXTENSIONS:
        return False
    if ext in TEXT_EXTENSIONS:
        return True
    try:
        with open(path, "r", encoding="utf-8") as f:
            f.read()
        return True
    except:
        return False

def get_database_info(db_url):
    """
    Fetch database schema information using psql commands
    """
    info = []
    
    # List of SQL commands to run
    commands = [
        ("List of all tables", "\\dt"),
        ("Sample RS table structure (rs_2005_06)", "\\d rs_2005_06"),
        ("Sample RC table structure (rc_2005_06)", "\\d rc_2005_06"),
        ("Subreddit table map structure", "\\d subreddit_table_map"),
        
        # --- NEW: Added Metadata Table Info ---
        ("Optimization Table: subreddits_metadata", "\\d subreddits_metadata"),
        ("Sample rows from Metadata", "SELECT * FROM subreddits_metadata LIMIT 5;"),
        # --------------------------------------

        ("Sample row from RS table", "SELECT * FROM rs_2005_06 LIMIT 1;"),
        ("Sample row from RC table", "SELECT * FROM rc_2005_06 LIMIT 1;"),
        ("All RS table columns", """
            SELECT table_name, column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name LIKE 'rs_%' 
            ORDER BY table_name, ordinal_position 
            LIMIT 100;
        """),
        ("All RC table columns", """
            SELECT table_name, column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name LIKE 'rc_%' 
            ORDER BY table_name, ordinal_position 
            LIMIT 100;
        """),
        ("All indexes on rs_2005_06", """
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = 'rs_2005_06';
        """),
    ]
    
    for description, command in commands:
        try:
            result = subprocess.run(
                ['psql', db_url, '-c', command],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            info.append(f"\n{'='*80}\n")
            info.append(f"DATABASE INFO: {description}\n")
            info.append(f"{'='*80}\n\n")
            
            if result.returncode == 0:
                info.append(result.stdout)
            else:
                info.append(f"Error: {result.stderr}\n")
                
        except subprocess.TimeoutExpired:
            info.append(f"Query timed out\n")
        except FileNotFoundError:
            info.append(f"Error: psql command not found. Make sure PostgreSQL is installed and in PATH.\n")
            break
        except Exception as e:
            info.append(f"Error executing command: {e}\n")
    
    return ''.join(info)

def collect_project_text(root_dir, output_file="project.txt"):
    with open(output_file, "w", encoding="utf-8") as out:
        # First, add database schema information
        out.write("\n" + "="*80 + "\n")
        out.write("DATABASE SCHEMA INFORMATION\n")
        out.write("="*80 + "\n")
        
        # Default database URL - modify if different
        db_url = "postgres://postgres:postgres@localhost:5432/Reddit-Rebuilt"
        
        print("Fetching database schema information...")
        db_info = get_database_info(db_url)
        out.write(db_info)
        
        print("Collecting project files...")
        
        # Then collect all project files
        for current_root, dirs, files in os.walk(root_dir):
            # Remove ignored directories
            dirs[:] = [
                d for d in dirs
                if d not in IGNORED_DIRS and not d.startswith(".")
            ]
            
            for file in files:
                # Skip hidden files
                if file.startswith("."):
                    continue
                
                if file in IGNORED_FILES:
                    continue
                
                file_path = os.path.join(current_root, file)
                
                if not is_text_file(file_path):
                    continue
                
                rel_path = os.path.relpath(file_path, root_dir)
                
                out.write("\n" + "="*80 + "\n")
                out.write(f"FILE: {rel_path}\n")
                out.write("="*80 + "\n\n")
                
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        out.write(f.read())
                except Exception as e:
                    out.write(f"[Error reading file: {e}]")
    
    print("Done! Output written to project.txt")

if __name__ == "__main__":
    current_directory = os.getcwd()
    collect_project_text(current_directory)