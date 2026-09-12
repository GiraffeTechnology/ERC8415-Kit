"""Operator-only first-user provisioning. No default credentials."""
import getpass
import os

from engine.auth import AuthService
from engine.database import database


def main():
    url = os.environ["KIT_DATABASE_URL"]
    username = input("Administrator username: ").strip()
    password = getpass.getpass("Administrator password (12+ characters): ")
    sessions = database(url)
    try:
        AuthService(sessions).create_user(username, password, "ADMIN",
                                           tenant=os.environ.get("KIT_TENANT", "default"))
        print("Administrator created.")
    finally:
        sessions.kw["bind"].dispose()


if __name__ == "__main__":
    main()
