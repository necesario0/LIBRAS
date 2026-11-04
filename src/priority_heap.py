"""
Project LIBRAS: Circulation Hold & Reservation Scheduler
Algorithm 2: Role-Weighted Composite Min-Heap Priority Queue
Course: ALGOCOM × SOFTENG (PBL Milestone 1)
Academic Year 2026–2027 • Section III-BCSAD • Group 1

Implements an array-backed binary Min-Heap enforcing the complete binary tree
shape invariant and heap-order invariant for deterministic, race-free hold resolution.
"""

import time
from typing import Dict, List, Optional, Any, Tuple


class ReservationNode:
    """Represents a queued reservation with composite priority scoring."""
    __slots__ = (
        "patron_id",
        "role",
        "arrival_timestamp",
        "accession_copy_id",
        "priority_score",
        "full_name",
        "email",
    )

    def __init__(
        self,
        patron_id: str,
        role: str,
        arrival_timestamp: int,
        accession_copy_id: str,
        priority_score: int,
        full_name: str = "",
        email: str = ""
    ):
        self.patron_id = patron_id
        self.role = role
        self.arrival_timestamp = arrival_timestamp
        self.accession_copy_id = accession_copy_id
        self.priority_score = priority_score
        self.full_name = full_name
        self.email = email

    def to_dict(self) -> Dict[str, Any]:
        return {
            "patron_id": self.patron_id,
            "role": self.role,
            "arrival_timestamp": self.arrival_timestamp,
            "accession_copy_id": self.accession_copy_id,
            "priority_score": self.priority_score,
            "full_name": self.full_name,
            "email": self.email,
        }

    def __repr__(self) -> str:
        return f"<ReservationNode patron='{self.patron_id}' role='{self.role}' score={self.priority_score}>"


class PriorityHoldQueue:
    """
    Role-Weighted Composite Min-Heap Priority Queue.
    Maintains complete binary tree depth floor(log2 K) with O(log K) insertion/extraction.
    """

    # Role weight constants (virtual milliseconds advance)
    ROLE_WEIGHTS: Dict[str, int] = {
        "Faculty": 86_400_000,      # 24-hour virtual arrival priority advance
        "NTP": 43_200_000,          # 12-hour advance for Non-Teaching Personnel
        "Student": 0,               # 0 ms (Strict FIFO arrival)
        "Visitor": -86_400_000,     # Deprioritized below institutional patrons
    }

    def __init__(self):
        self._heap: List[ReservationNode] = []

    def size(self) -> int:
        return len(self._heap)

    def is_empty(self) -> bool:
        return len(self._heap) == 0

    @classmethod
    def calculate_priority_score(cls, arrival_timestamp: int, role: str) -> int:
        """
        Computes composite priority score:
        PriorityScore = arrival_timestamp - W_factor(role)
        Smaller score strictly indicates higher priority.
        """
        weight = cls.ROLE_WEIGHTS.get(role, cls.ROLE_WEIGHTS["Visitor"])
        return arrival_timestamp - weight

    def enqueue(
        self,
        patron_id: str,
        role: str,
        arrival_timestamp: int,
        accession_copy_id: str,
        full_name: str = "",
        email: str = ""
    ) -> ReservationNode:
        """
        Inserts a new reservation request into the Min-Heap.
        Time Complexity: O(log K) worst-case; Theta(1) average.
        """
        score = self.calculate_priority_score(arrival_timestamp, role)
        node = ReservationNode(
            patron_id=patron_id,
            role=role,
            arrival_timestamp=arrival_timestamp,
            accession_copy_id=accession_copy_id,
            priority_score=score,
            full_name=full_name,
            email=email
        )
        self._heap.append(node)
        self._sift_up(len(self._heap) - 1)
        return node

    def peek(self) -> Optional[ReservationNode]:
        """
        Inspects the highest-priority queued patron without extraction.
        Time Complexity: O(1).
        """
        if not self._heap:
            return None
        return self._heap[0]

    def extract_min(self) -> Tuple[Optional[ReservationNode], Dict[str, Any]]:
        """
        Extracts and returns the highest-priority patron node.
        Restores the heap-order invariant in O(log K).
        Returns: (winning_patron_node, telemetry_dict)
        """
        start_time = time.perf_counter()

        # Edge-Case Guard: Empty queue check
        if not self._heap:
            duration_ms = (time.perf_counter() - start_time) * 1000
            return None, {
                "allocation_status": "NO_ACTIVE_HOLDS_AVAILABLE",
                "resolution_latency_ms": round(duration_ms, 3),
                "queue_remaining_count": 0,
            }

        # Single element case
        if len(self._heap) == 1:
            winning_node = self._heap.pop()
            duration_ms = (time.perf_counter() - start_time) * 1000
            return winning_node, {
                "allocation_status": "ALLOCATED_TO_HOLD",
                "resolution_latency_ms": round(duration_ms, 3),
                "queue_remaining_count": 0,
            }

        # Root swap and sift-down
        winning_node = self._heap[0]
        self._heap[0] = self._heap.pop()
        self._sift_down(0)

        duration_ms = (time.perf_counter() - start_time) * 1000

        telemetry = {
            "allocation_status": "ALLOCATED_TO_HOLD",
            "resolution_latency_ms": round(duration_ms, 3),
            "queue_remaining_count": len(self._heap),
        }

        return winning_node, telemetry

    def _sift_up(self, idx: int) -> None:
        """
        Restores heap invariant upward from the newly inserted leaf.
        Parent(i) = floor((i - 1) / 2).
        """
        parent_idx = (idx - 1) // 2
        while idx > 0 and self._heap[idx].priority_score < self._heap[parent_idx].priority_score:
            self._heap[idx], self._heap[parent_idx] = self._heap[parent_idx], self._heap[idx]
            idx = parent_idx
            parent_idx = (idx - 1) // 2

    def _sift_down(self, idx: int) -> None:
        """
        Restores heap invariant downward after replacing root with last leaf.
        LeftChild(i) = 2i + 1, RightChild(i) = 2i + 2.
        """
        size = len(self._heap)
        smallest = idx

        while True:
            left = 2 * idx + 1
            right = 2 * idx + 2

            if left < size and self._heap[left].priority_score < self._heap[smallest].priority_score:
                smallest = left

            if right < size and self._heap[right].priority_score < self._heap[smallest].priority_score:
                smallest = right

            if smallest != idx:
                self._heap[idx], self._heap[smallest] = self._heap[smallest], self._heap[idx]
                idx = smallest
            else:
                break
