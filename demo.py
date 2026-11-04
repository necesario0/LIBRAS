"""
Project LIBRAS - Interactive Algorithmic Engine Demo
Run directly in your terminal:
    python demo.py
"""

from src.trie_levenshtein import TrieLevenshteinEngine
from src.priority_heap import PriorityHoldQueue

def run_trie_search_demo():
    print("=" * 70)
    print("1. OPAC FUZZY CATALOG SEARCH ENGINE (Trie + Levenshtein DP)")
    print("=" * 70)

    engine = TrieLevenshteinEngine()

    sample_catalog = [
        ("Introduction to Algorithms", "Thomas Cormen", "005.133 COR", "9780262046373"),
        ("Artificial Intelligence: A Modern Approach", "Stuart Russell", "006.3 RUS", "9780134610992"),
        ("Database System Concepts", "Abraham Silberschatz", "005.74 SIL", "9780073523323"),
        ("Operating System Concepts", "Abraham Silberschatz", "005.43 SIL", "9781119800361"),
        ("Computer Networks", "Andrew Tanenbaum", "004.6 TAN", "9780132126953"),
        ("Philippine History and Culture", "Teodoro Agoncillo", "959.9 AGO", "9789711003449"),
        ("Discrete Mathematics and Its Applications", "Kenneth Rosen", "511.02 ROS", "9781259676512"),
    ]

    print(f"[*] Indexing {len(sample_catalog)} bibliographic titles into Trie Prefix Tree...")
    for title, author, call_no, isbn in sample_catalog:
        engine.insert_book(title, author=author, call_number=call_no, isbn=isbn)
    print(f"[+] Total unique indexed tokens in Trie: {engine.total_tokens}\n")

    queries_to_test = [
        ("Algoritm", 2, "Typo query (missing 'h' in Algorithms)"),
        ("Artifitial", 2, "Typo query ('t' instead of 'c')"),
        ("Russel", 1, "Author surname typo (missing 'l')"),
        ("005.74", 0, "Exact Dewey Decimal call number"),
        ("Tanenbaum", 0, "Exact author surname"),
    ]

    for q, max_cost, note in queries_to_test:
        print(f"--- Query: '{q}' (max_cost={max_cost}) | Context: {note} ---")
        results, telemetry = engine.search(q, max_cost=max_cost, limit=3)
        print(f"  Latency: {telemetry['execution_time_ms']} ms | Visited Nodes: {telemetry['nodes_visited']} | Pruned Branches: {telemetry['branches_pruned']}")
        if results:
            for idx, r in enumerate(results, 1):
                print(f"    [{idx}] Matched Token: '{r.matched_token}' (Edit Distance: {r.edit_distance})")
                print(f"        Book Title:    {r.title}")
                print(f"        Call Number:   {r.metadata.get('call_number', 'N/A')}")
        else:
            print("    [!] No matching books found.")
        print()


def run_priority_heap_demo():
    print("=" * 70)
    print("2. CIRCULATION HOLD & RESERVATION SCHEDULER (Role-Weighted Min-Heap)")
    print("=" * 70)

    heap = PriorityHoldQueue()

    # Base timestamp (representing 8:00 AM)
    t0 = 1700000000000

    sample_holds = [
        ("STU-101", "Student", t0, "ACC-0042", "Juan Dela Cruz (Student)"),
        ("STU-102", "Student", t0 + 3600000, "ACC-0042", "Maria Santos (Student, 1hr later)"),
        ("NTP-001", "NTP",     t0 + 7200000, "ACC-0042", "Engr. Reyes (NTP, 2hrs later)"),
        ("FAC-001", "Faculty", t0 + 18000000, "ACC-0042", "Prof. Maestro (Faculty, 5hrs later)"),
        ("VIS-001", "Visitor", t0 - 3600000, "ACC-0042", "Guest Researcher (Visitor, 1hr earlier)"),
    ]

    print("[*] Enqueueing contending reservations for Book Accession 'ACC-0042':")
    for pid, role, ts, acc, name in sample_holds:
        node = heap.enqueue(pid, role, ts, acc, full_name=name)
        print(f"  + Queued {name} [{role}]: Raw Time={ts} -> PriorityScore={node.priority_score}")
    print()

    print("[*] Simulating book copy check-in at Circulation Desk (Extract-Min Resolution):")
    rank = 1
    while not heap.is_empty():
        winner, telemetry = heap.extract_min()
        print(f"  Rank #{rank} Winning Patron: {winner.full_name} [{winner.role}]")
        print(f"       PriorityScore: {winner.priority_score} | Resolution Latency: {telemetry['resolution_latency_ms']} ms")
        print(f"       Remaining Holds in Heap: {telemetry['queue_remaining_count']}")
        rank += 1
    print("\n[+] Notice how Prof. Maestro (Faculty) won Rank #1 due to the 24-hour virtual boost,")
    print("    even though students and visitors queued hours before him!")
    print("=" * 70)


if __name__ == "__main__":
    run_trie_search_demo()
    run_priority_heap_demo()
