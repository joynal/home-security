#!/usr/bin/env python3
"""
scripts/set_password.py
───────────────────────
Utility to set or change the admin password for the home security system.

This script updates the credentials.json file with a new hashed password.
Run it from the project root or specify the data directory path.

Usage:
    python scripts/set_password.py                    # Interactive mode
    python scripts/set_password.py --password newpass  # Direct password
    python scripts/set_password.py --data-dir ./data   # Custom data dir
"""

import argparse
import getpass
import json
import sys
from pathlib import Path

from passlib.context import CryptContext

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import DATA_DIR


def get_credentials_file(data_dir: Path) -> Path:
    """Get the path to the credentials file."""
    return data_dir / "credentials.json"


def load_credentials(creds_file: Path) -> dict:
    """Load existing credentials from file, or return default structure if file doesn't exist."""
    if not creds_file.exists():
        # Return default credentials structure for new setup
        return {
            "username": "admin",
            "hashed_password": "",
        }

    with open(creds_file) as f:
        return json.load(f)


def save_credentials(creds_file: Path, credentials: dict) -> None:
    """Save credentials to file."""
    creds_file.parent.mkdir(parents=True, exist_ok=True)
    with open(creds_file, "w") as f:
        json.dump(credentials, f, indent=2)


def validate_password_strength(password: str) -> tuple[bool, str]:
    """
    Validate password strength.

    Returns:
        tuple: (is_valid, error_message)
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."

    if not any(c.isupper() for c in password):
        return False, "Password must contain at least one uppercase letter."

    if not any(c.islower() for c in password):
        return False, "Password must contain at least one lowercase letter."

    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least one digit."

    return True, ""


def set_password(new_password: str, data_dir: Path) -> None:
    """Set a new password for the admin user."""
    pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    creds_file = get_credentials_file(data_dir)

    # Check if this is a new credentials file
    is_new_file = not creds_file.exists()

    # Load existing credentials
    credentials = load_credentials(creds_file)

    # Validate password strength
    is_valid, error_msg = validate_password_strength(new_password)
    if not is_valid:
        print(f"\n❌ Password validation failed: {error_msg}")
        sys.exit(1)

    # Hash the new password
    hashed_password = pwd_ctx.hash(new_password)

    # Update credentials
    credentials["hashed_password"] = hashed_password

    # Save credentials
    save_credentials(creds_file, credentials)

    action = "created" if is_new_file else "updated"
    print(f"\n✅ Password {action} successfully for user: {credentials['username']}")
    print(f"   Credentials file: {creds_file}")
    print("\n⚠️  Important: The .env file must contain a SECRET_KEY for JWT tokens.")
    print("   If you haven't set it, create a .env file with:")
    print("   SECRET_KEY=<your-secret-key-here>")


def main():
    parser = argparse.ArgumentParser(
        description="Set or change the admin password for the home security system",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Interactive mode (prompts for password securely)
  python scripts/set_password.py

  # Set password directly (use with caution, visible in shell history)
  python scripts/set_password.py --password MySecurePass123

  # Use custom data directory
  python scripts/set_password.py --data-dir /path/to/data
        """,
    )

    parser.add_argument(
        "--password",
        help="New password to set (warning: visible in shell history)",
        type=str,
    )

    parser.add_argument(
        "--data-dir",
        help=f"Path to data directory (default: {DATA_DIR})",
        type=Path,
        default=DATA_DIR,
    )

    args = parser.parse_args()

    # Get password either from argument or interactive prompt
    if args.password:
        password = args.password
    else:
        print("🔐 Set Admin Password")
        print("────────────────────\n")
        password = getpass.getpass("Enter new password: ")
        confirm = getpass.getpass("Confirm password: ")

        if password != confirm:
            print("\n❌ Error: Passwords do not match.")
            sys.exit(1)

        if not password:
            print("\n❌ Error: Password cannot be empty.")
            sys.exit(1)

    # Set the password
    set_password(password, args.data_dir)


if __name__ == "__main__":
    main()
