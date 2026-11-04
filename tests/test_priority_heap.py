"""
Unit Tests for Role-Weighted Composite Min-Heap Priority Queue
Ticket: DEV-ALGO-102 (Circulation Hold & Reservation Dispatcher)
Course: ALGOCOM × SOFTENG (PBL Milestone 1)
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.priority_heap import PriorityHoldQueue, ReservationNode


class TestPriorityHoldQueue(unittest.TestCase):

    def setUp(self):
        self.heap = PriorityHoldQueue()
        self.t0 = 1700000000000  # Base timestamp

    def test_empty_queue_guard(self):
        """Extract-Min on an empty heap must return None with NO_ACTIVE_HOLDS_AVAILABLE in < 1ms."""
        self.assertTrue(self.heap.is_empty())
        self.assertEqual(self.heap.size(), 0)
        winner, telemetry = self.heap.extract_min()
        self.assertIsNone(winner)
        self.assertEqual(telemetry["allocation_status"], "NO_ACTIVE_HOLDS_AVAILABLE")
        self.assertLess(telemetry["resolution_latency_ms"], 1.0)

    def test_single_element_enqueue_and_extract(self):
        """Single element queue should be enqueued and extracted properly."""
        node = self.heap.enqueue("STU-01", "Student", self.t0, "ACC-101", full_name="Student 1")
        self.assertEqual(self.heap.size(), 1)
        self.assertEqual(self.heap.peek().patron_id, "STU-01")

        winner, telemetry = self.heap.extract_min()
        self.assertEqual(winner.patron_id, "STU-01")
        self.assertEqual(telemetry["allocation_status"], "ALLOCATED_TO_HOLD")
        self.assertTrue(self.heap.is_empty())

    def test_faculty_boost_over_student_fifo(self):
        """
        Faculty member arriving 5 hours later (t0 + 18,000,000 ms) MUST beat
        a student arriving at t0 due to the 24-hour (86,400,000 ms) priority boost.
        """
        # Student arrives at t0
        self.heap.enqueue("STU-01", "Student", self.t0, "ACC-101", full_name="Student Early")
        # Faculty arrives 5 hours later
        self.heap.enqueue("FAC-01", "Faculty", self.t0 + 18000000, "ACC-101", full_name="Faculty Late")

        # Winner must be Faculty
        winner, _ = self.heap.extract_min()
        self.assertEqual(winner.patron_id, "FAC-01")
        self.assertEqual(winner.role, "Faculty")

        # Next winner is Student
        next_winner, _ = self.heap.extract_min()
        self.assertEqual(next_winner.patron_id, "STU-01")

    def test_fifo_tie_breaking_identical_roles(self):
        """
        Two patrons with identical roles (e.g. Student) MUST be resolved in strict FIFO order.
        """
        self.heap.enqueue("STU-A", "Student", self.t0, "ACC-101", full_name="Student A (First)")
        self.heap.enqueue("STU-B", "Student", self.t0 + 5000, "ACC-101", full_name="Student B (Second)")
        self.heap.enqueue("STU-C", "Student", self.t0 + 10000, "ACC-101", full_name="Student C (Third)")

        w1, _ = self.heap.extract_min()
        w2, _ = self.heap.extract_min()
        w3, _ = self.heap.extract_min()

        self.assertEqual(w1.patron_id, "STU-A")
        self.assertEqual(w2.patron_id, "STU-B")
        self.assertEqual(w3.patron_id, "STU-C")

    def test_complete_role_tier_hierarchy(self):
        """
        Hierarchy check: Faculty > NTP > Student > Visitor for concurrent requests.
        """
        self.heap.enqueue("VIS-01", "Visitor", self.t0, "ACC-101", full_name="Visitor")
        self.heap.enqueue("STU-01", "Student", self.t0, "ACC-101", full_name="Student")
        self.heap.enqueue("NTP-01", "NTP", self.t0, "ACC-101", full_name="NTP")
        self.heap.enqueue("FAC-01", "Faculty", self.t0, "ACC-101", full_name="Faculty")

        roles_extracted = []
        while not self.heap.is_empty():
            w, _ = self.heap.extract_min()
            roles_extracted.append(w.role)

        self.assertEqual(roles_extracted, ["Faculty", "NTP", "Student", "Visitor"])

    def test_heap_order_invariant_at_scale(self):
        """
        Enqueues 500 random elements and verifies that each extracted element has
        a priority score >= the previous extracted element (monotonic non-decreasing).
        """
        import random
        random.seed(42)
        roles = ["Faculty", "NTP", "Student", "Visitor"]

        for i in range(500):
            role = random.choice(roles)
            ts = self.t0 + random.randint(0, 100000000)
            self.heap.enqueue(f"PAT-{i}", role, ts, "ACC-101")

        self.assertEqual(self.heap.size(), 500)

        prev_score = -float("inf")
        while not self.heap.is_empty():
            winner, _ = self.heap.extract_min()
            self.assertGreaterEqual(winner.priority_score, prev_score)
            prev_score = winner.priority_score


if __name__ == "__main__":
    unittest.main()
