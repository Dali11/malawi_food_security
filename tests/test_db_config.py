import unittest

from api.db_config import build_db_config


class DatabaseConfigTests(unittest.TestCase):
    def setUp(self):
        self.env = {
            "DB_HOST": "postgis",
            "DB_PORT": "5432",
            "DB_NAME": "malawi_food_security",
            "DB_USER": "food_app",
            "DB_PASSWORD": "example-only-test-secret",
            "DB_SSL": "disable",
        }

    def test_requires_password_instead_of_falling_back_to_a_source_default(self):
        env = {key: value for key, value in self.env.items() if key != "DB_PASSWORD"}
        with self.assertRaisesRegex(ValueError, "DB_PASSWORD"):
            build_db_config("asyncpg", env)

    def test_builds_asyncpg_settings_for_private_coolify_network(self):
        config = build_db_config("asyncpg", self.env)
        self.assertEqual(config["host"], "postgis")
        self.assertEqual(config["port"], 5432)
        self.assertEqual(config["database"], "malawi_food_security")
        self.assertEqual(config["user"], "food_app")
        self.assertEqual(config["password"], self.env["DB_PASSWORD"])
        self.assertNotIn("ssl", config)

    def test_builds_psycopg2_settings_with_ssl_disabled_for_private_network(self):
        config = build_db_config("psycopg2", self.env)
        self.assertEqual(config["dbname"], "malawi_food_security")
        self.assertEqual(config["sslmode"], "disable")
        self.assertNotIn("database", config)

    def test_requires_tls_by_default_for_nonlocal_database_hosts(self):
        env = {key: value for key, value in self.env.items() if key != "DB_SSL"}
        self.assertEqual(build_db_config("asyncpg", env)["ssl"], "require")

    def test_requires_tls_when_explicitly_requested(self):
        env = {**self.env, "DB_SSL": "require"}
        self.assertEqual(build_db_config("asyncpg", env)["ssl"], "require")
        self.assertEqual(build_db_config("psycopg2", env)["sslmode"], "require")

    def test_rejects_unknown_driver(self):
        with self.assertRaisesRegex(ValueError, "driver"):
            build_db_config("unknown", self.env)


if __name__ == "__main__":
    unittest.main()
