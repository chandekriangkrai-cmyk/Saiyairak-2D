"""Exercise autonomous control flow offline: no API usage or generated commits."""
import unittest
from unittest.mock import patch
import autonomous_developer as developer


class AutonomousCycleTests(unittest.TestCase):
    def test_missing_key_is_failure(self):
        with patch.object(developer, "KEY", ""), patch.object(developer, "ask") as ask:
            self.assertEqual(developer.main(), 1)
            ask.assert_not_called()

    def test_cycle_reaches_generation_and_validation(self):
        with patch.object(developer, "KEY", "offline-test"), \
             patch.object(developer, "sh", return_value=""), \
             patch.object(developer, "ask", return_value={"patch": "offline fixture"}) as ask, \
             patch.object(developer, "apply_patch", return_value=True) as apply, \
             patch.object(developer, "test") as validate:
            self.assertIsNone(developer.main())
            ask.assert_called_once()
            apply.assert_called_once_with("offline fixture")
            validate.assert_called_once()

    def test_generation_error_is_failure(self):
        with patch.object(developer, "KEY", "offline-test"), \
             patch.object(developer, "sh", return_value=""), \
             patch.object(developer, "ask", side_effect=RuntimeError("offline failure")):
            self.assertEqual(developer.main(), 1)

    def test_repair_respects_call_budget(self):
        with patch.object(developer, "KEY", "offline-test"), \
             patch.object(developer, "MAX_CALLS", 1), \
             patch.object(developer, "sh", return_value=""), \
             patch.object(developer, "ask", return_value={"patch": "offline fixture"}) as ask, \
             patch.object(developer, "apply_patch", return_value=True), \
             patch.object(developer, "test", side_effect=RuntimeError("validation failure")):
            self.assertEqual(developer.main(), 1)
            ask.assert_called_once()


if __name__ == "__main__":
    unittest.main()
