"""
Project LIBRAS - Empirical Validation & Automated Benchmarking Suite
Course: ALGOCOM × SOFTENG (PBL Milestone 1)
Adviser: Prof. Nomar Maestro • Group 1 (Section III-BCSAD)

Compares:
1. OPAC Search: Bounded Trie Levenshtein Search vs. Naive SQL Linear Scan (N = 10,000 titles)
   Assertion: assert trie_latency_ms < 35.0 ms
2. Hold Queue: Role-Weighted Min-Heap Dispatcher vs. Naive Unindexed Sort (K = 1,000 holds)
   Assertion: assert heap_latency_ms < 10.0 ms
"""

import os
import sys
import time
import random
import string
from typing import List, Tuple

# Ensure project root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.trie_levenshtein import TrieLevenshteinEngine
from src.priority_heap import PriorityHoldQueue


# ---------------------------------------------------------------------------
# Naive Baselines for Empirical Profiling Comparison
# ---------------------------------------------------------------------------

def naive_levenshtein(s1: str, s2: str) -> int:
    """Standard unmemoized 2D matrix Levenshtein distance O(m * n)."""
    m, n = len(s1), len(s2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            cost = 0 if s1[i - 1] == s2[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,       # deletion
                dp[i][j - 1] + 1,       # insertion
                dp[i - 1][j - 1] + cost  # substitution
            )
    return dp[m][n]


def naive_linear_scan_search(dataset: List[str], query: str, max_cost: int = 2) -> List[Tuple[str, int]]:
    """Simulates an unindexed database sequential scan computing Levenshtein across all N rows."""
    matches = []
    norm_query = query.lower().strip()
    for word in dataset:
        d = naive_levenshtein(norm_query, word.lower())
        if d <= max_cost:
            matches.append((word, d))
    return matches


def naive_unsorted_hold_dispatch(hold_list: List[dict]) -> dict:
    """Simulates an unindexed database table scan sorting all K holds on every return transaction."""
    # Full sort O(K log K)
    sorted_holds = sorted(hold_list, key=lambda x: x["priority_score"])
    if sorted_holds:
        return sorted_holds[0]
    return {}


# ---------------------------------------------------------------------------
# Synthetic Dataset Generators
# ---------------------------------------------------------------------------

def generate_synthetic_catalog(n: int = 10000) -> List[str]:
    """Generates N realistic academic catalog titles and call numbers."""
    prefixes = ["Introduction to", "Advanced", "Principles of", "Fundamentals of", "Modern", "Applied", "Handbook of"]
    subjects = ["Algorithms", "Machine Learning", "Database Systems", "Operating Systems", "Computer Architecture",
                "Data Structures", "Artificial Intelligence", "Information Security", "Software Engineering",
                "Discrete Mathematics", "Cloud Computing", "Computer Networks", "Cybersecurity", "Deep Learning"]
    suffixes = ["Concepts", "Practice", "Applications", "Systems", "Design", "Analysis", "and Case Studies"]

    dataset = []
    for i in range(n):
        title = f"{random.choice(prefixes)} {random.choice(subjects)} {random.choice(suffixes)} (Vol. {random.randint(1, 10)})"
        dataset.append(title)
    return dataset


# ---------------------------------------------------------------------------
# Benchmarking Execution
# ---------------------------------------------------------------------------

def benchmark_opac_catalog_search():
    print("=" * 75)
    print("BENCHMARK 1: OPAC FUZZY CATALOG SEARCH (Task 5 / DEV-ALGO-101)")
    print("=" * 75)

    n_records = 10000
    print(f"[*] Generating synthetic catalog of N = {n_records:,} bibliographic records...")
    raw_catalog = generate_synthetic_catalog(n=n_records)

    # Insert special known target for validation
    target_title = "Advanced Algorithms and Complexity Analysis"
    raw_catalog[5000] = target_title

    engine = TrieLevenshteinEngine()
    print("[*] Ingesting titles into Bounded Trie Prefix Tree...")
    t_start_ingest = time.perf_counter()
    for title in raw_catalog:
        engine.insert_book(title, call_number="005.133 ALG")
    t_ingest_ms = (time.perf_counter() - t_start_ingest) * 1000
    print(f"[+] Trie constructed in {t_ingest_ms:.2f} ms ({engine.total_tokens:,} unique tokens)\n")

    test_queries = [
        ("Algoritm", 2, "Typo query (missing 'h')"),
        ("Advansed", 1, "Typo query (c -> s)"),
        ("Complexiti", 1, "Typo query (y -> i)"),
    ]

    for query, max_cost, desc in test_queries:
        print(f"--- Running Query: '{query}' (max_cost={max_cost}) [{desc}] ---")

        # 1. Benchmark Naive Linear Scan Baseline (on sample of 1,000 for realistic baseline timing)
        baseline_sample_size = 1000
        t_naive_start = time.perf_counter()
        naive_matches = naive_linear_scan_search(raw_catalog[:baseline_sample_size], query, max_cost=max_cost)
        t_naive_sample_ms = (time.perf_counter() - t_naive_start) * 1000
        # Extrapolate to full 10,000 records
        t_naive_projected_ms = t_naive_sample_ms * (n_records / baseline_sample_size)

        # 2. Benchmark Optimized Trie Engine (on full 10,000 records!)
        t_trie_start = time.perf_counter()
        trie_matches, telemetry = engine.search(query, max_cost=max_cost, limit=5)
        t_trie_ms = (time.perf_counter() - t_trie_start) * 1000

        print(f"  [Naive Linear Scan] Projected 10k Latency: {t_naive_projected_ms:.2f} ms")
        print(f"  [Bounded Trie Automaton] Actual 10k Latency: {t_trie_ms:.2f} ms (Engine Telemetry: {telemetry['execution_time_ms']} ms)")
        print(f"  [Speedup Factor] {t_naive_projected_ms / max(t_trie_ms, 0.001):.1f}x Faster than Naive Baseline")
        print(f"  [Search Telemetry] Visited Nodes: {telemetry['nodes_visited']} | Pruned Branches: {telemetry['branches_pruned']} | Matches Found: {len(trie_matches)}")

        # Automated Milestone Performance Assertion
        assert t_trie_ms < 35.0, f"FAILED: Trie search latency {t_trie_ms} ms exceeded 35ms SLA threshold!"
        print(f"  [PASS] Assertion Passed: Latency {t_trie_ms:.2f} ms < 35.0 ms SLA threshold\n")

    print("[SUCCESS] All Catalog Search Benchmarks and SLAs Verified!\n")


def benchmark_hold_queue_dispatch():
    print("=" * 75)
    print("BENCHMARK 2: CIRCULATION HOLD QUEUE SCHEDULING (Task 5 / DEV-ALGO-102)")
    print("=" * 75)

    k_holds = 1000
    print(f"[*] Generating synthetic pool of K = {k_holds:,} contending patron reservations...")

    roles = ["Faculty", "NTP", "Student", "Visitor"]
    t0 = 1700000000000
    random.seed(42)

    raw_holds = []
    heap = PriorityHoldQueue()

    for i in range(k_holds):
        pid = f"PATRON-{i:05d}"
        role = random.choice(roles)
        timestamp = t0 + random.randint(0, 86400000 * 7)  # over 7 days
        score = PriorityHoldQueue.calculate_priority_score(timestamp, role)
        hold_item = {
            "patron_id": pid,
            "role": role,
            "arrival_timestamp": timestamp,
            "priority_score": score,
            "accession_copy_id": "ACC-UMAK-999"
        }
        raw_holds.append(hold_item)
        heap.enqueue(pid, role, timestamp, "ACC-UMAK-999")

    print(f"[+] Initialized Binary Min-Heap with {heap.size():,} active holds.\n")

    # 1. Benchmark Naive Full Sort Dispatch Baseline
    t_naive_start = time.perf_counter()
    naive_winner = naive_unsorted_hold_dispatch(raw_holds)
    t_naive_ms = (time.perf_counter() - t_naive_start) * 1000

    # 2. Benchmark Optimized Min-Heap Extraction
    t_heap_start = time.perf_counter()
    heap_winner, telemetry = heap.extract_min()
    t_heap_ms = (time.perf_counter() - t_heap_start) * 1000

    print(f"  [Naive Unsorted Table Sort] Resolution Latency: {t_naive_ms:.3f} ms")
    print(f"  [Binary Min-Heap Extract]   Resolution Latency: {t_heap_ms:.3f} ms (Heap Telemetry: {telemetry['resolution_latency_ms']} ms)")
    print(f"  [Speedup Factor]            {t_naive_ms / max(t_heap_ms, 0.0001):.1f}x Faster than Full Sort")
    print(f"  [Winning Patron]            {heap_winner.patron_id} [{heap_winner.role}] (Score: {heap_winner.priority_score})")

    # Verify both methods agree on the exact optimal winning patron
    assert naive_winner["patron_id"] == heap_winner.patron_id, "FAILED: Heap did not return the globally optimal patron!"
    print("  [PASS] Mathematical Soundness Verified: Heap returned identical winning patron as full sort.")

    # Automated Milestone Performance Assertion
    assert t_heap_ms < 10.0, f"FAILED: Heap extraction latency {t_heap_ms} ms exceeded 10ms SLA threshold!"
    print(f"  [PASS] Assertion Passed: Latency {t_heap_ms:.3f} ms < 10.0 ms SLA threshold\n")

    print("[SUCCESS] All Circulation Hold Queue Benchmarks and SLAs Verified!\n")


if __name__ == "__main__":
    benchmark_opac_catalog_search()
    benchmark_hold_queue_dispatch()
