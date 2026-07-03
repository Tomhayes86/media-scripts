#!/usr/bin/env python3
"""
This script tests and filters a list of trackers to find out which ones return
valid responses and saves the valid ones to a file.

Requirements: Python 3.8+, pip install requests rich

Updated: 4 January 2026 - Added multiple tracker sources, progress bar, concurrent testing
"""

import requests
import socket
import logging
import struct
import random
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn, TimeRemainingColumn, MofNCompleteColumn
from rich.console import Console

console = Console()

#
#   CONFIGURATION
#

# URLs of tracker lists to fetch and test
# These are popular, regularly-updated public tracker lists
TRACKER_LISTS = [
    # ngosang/trackerslist - The most popular and well-maintained list
    "https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_all.txt",
    
    # XIU2/TrackersListCollection - Another popular tracker collection
    "https://raw.githubusercontent.com/XIU2/TrackersListCollection/master/all.txt",
    
    # DeSireFire/animeTrackerList - Comprehensive tracker list with anime focus
    "https://raw.githubusercontent.com/DeSireFire/animeTrackerList/master/AT_all.txt",
    
    # newTrackon API - Live tracker status API
    "https://newtrackon.com/api/all",
    
    # newTrackon stable trackers (95%+ uptime)
    "https://newtrackon.com/api/stable",
]

# Output file to save as. Will be overwritten.
OUTPUT_FILE = "valid_trackers.txt"

# Log file
LOG_FILE = "response_log.txt"

# Array of trackers to skip testing which cause hangs or other issues
SKIP_TRACKERS = ["udp://tracker.theoks.net:6969/announce"]

# Number of concurrent workers for testing trackers
MAX_WORKERS = 50

# Maximum response time in milliseconds - trackers slower than this are excluded
# Set to None to disable filtering and see all results
MAX_RESPONSE_TIME_MS = 750


#
#   FUNCTIONS
#


def is_valid_http_tracker(url):
    """
    Checks if an HTTP/HTTPS BitTorrent tracker is valid and responding.
    
    Uses a proper BEP 3 announce request with dummy parameters to test if the
    tracker actually processes BitTorrent requests (not just responds to HTTP).
    
    A tracker is considered valid if it returns bencoded data (even a "failure 
    reason" proves it's a working BitTorrent tracker).

    Args:
        url (str): The tracker announce URL to check.

    Returns:
        tuple: (bool, float or None) - (is_valid, response_time_ms)
    """
    import time
    import hashlib
    from urllib.parse import quote
    
    start_time = time.time()
    
    try:
        # Build a proper BEP 3 announce request with dummy parameters
        # This tests if the tracker actually processes BitTorrent protocol
        
        # Generate dummy but valid-looking parameters
        dummy_info_hash = hashlib.sha1(b'test_tracker_check').digest()
        dummy_peer_id = b'-PC0001-' + bytes([random.randint(0, 255) for _ in range(12)])
        
        # Build the full URL with parameters
        separator = '&' if '?' in url else '?'
        param_str = '&'.join([
            f'info_hash={quote(dummy_info_hash)}',
            f'peer_id={quote(dummy_peer_id)}',
            'port=6881',
            'uploaded=0',
            'downloaded=0',
            'left=0',
            'compact=1',
            'event=started'
        ])
        full_url = f"{url}{separator}{param_str}"
        
        response = requests.get(full_url, timeout=5, headers={
            'User-Agent': 'BitTorrent/7.10.5'
        })
        
        response_time_ms = (time.time() - start_time) * 1000
        content = response.content
        
        # Check if response contains bencoded data (starts with 'd' for dictionary)
        is_bencoded = len(content) > 2 and content.startswith(b'd') and content.endswith(b'e')
        
        is_valid = is_bencoded
        
        if is_valid:
            logging.info(f"HTTP Tracker valid: {url} ({response_time_ms:.0f}ms)")
        else:
            logging.warning(f"HTTP Tracker invalid: {url}, Status: {response.status_code}")
        
        return is_valid, response_time_ms
        
    except requests.exceptions.ConnectionError as e:
        logging.error(f"HTTP Connection error for {url}: {e}")
        return False, None
    except requests.exceptions.Timeout:
        logging.error(f"HTTP Timeout for {url}")
        return False, None
    except requests.exceptions.RequestException as e:
        logging.error(f"HTTP Error for {url}: {e}")
        return False, None


def is_valid_udp_endpoint(tracker_url, timeout=10):
    """
    Checks if a UDP endpoint is valid by performing a BitTorrent UDP tracker handshake.

    Args:
        tracker_url (str): The UDP endpoint URL to check.
        timeout (int): The timeout value for the UDP socket (default: 10).

    Returns:
        tuple: (bool, float or None) - (is_valid, response_time_ms)
    """
    import time
    start_time = time.time()
    
    try:
        # Parse the tracker URL to extract the hostname and port
        parsed_url = urlparse(tracker_url)
        tracker_host = parsed_url.hostname
        tracker_port = parsed_url.port

        # Check if hostname is valid
        if not tracker_host:
            logging.error(f"Invalid hostname in URL: {tracker_url}")
            return False, None

        # Check if the port is not specified and set it to the default UDP tracker port (6969)
        if tracker_port is None:
            tracker_port = 6969

    except ValueError as e:
        logging.error(f"Error parsing URL {tracker_url}: {e}")
        return False, None

    # Create a UDP socket with a timeout
    udp_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    udp_socket.settimeout(timeout)

    try:
        # Build the UDP tracker connection request
        # Protocol: https://www.bittorrent.org/beps/bep_0015.html
        connection_id = 0x41727101980  # Magic constant for initial connection
        action = 0  # 0 for connect
        transaction_id = random.randint(0, 0xFFFFFFFF)  # Random transaction ID

        # Construct the connection request packet: connection_id (8) + action (4) + transaction_id (4)
        connection_request = struct.pack(
            '!QII', connection_id, action, transaction_id)

        # Send the connection request
        udp_socket.sendto(connection_request, (tracker_host, tracker_port))

        # Log the UDP request
        logging.info(f"UDP Request sent to {tracker_host}:{tracker_port}")

        # Receive the connection response (16 bytes expected)
        response, _ = udp_socket.recvfrom(16)

        # Validate response length before unpacking
        if len(response) < 16:
            logging.error(
                f"UDP Response from {tracker_host}:{tracker_port} is too short ({len(response)} bytes)")
            return False, None

        # Unpack the connection response: action (4) + transaction_id (4) + connection_id (8)
        resp_action, resp_transaction_id, resp_connection_id = struct.unpack(
            '!IIQ', response)

        # Validate the response
        if resp_action != 0:
            logging.error(
                f"UDP Response from {tracker_host}:{tracker_port} has unexpected action: {resp_action}")
            return False, None

        if resp_transaction_id != transaction_id:
            logging.error(
                f"UDP Response from {tracker_host}:{tracker_port} has mismatched transaction ID")
            return False, None

        # Calculate response time
        response_time_ms = (time.time() - start_time) * 1000
        
        # Log successful connection
        logging.info(f"UDP Connection made to {tracker_host}:{tracker_port} ({response_time_ms:.0f}ms)")

        return True, response_time_ms

    except socket.timeout:
        logging.error(f"UDP Timeout for {tracker_host}:{tracker_port}")
        return False, None
    except socket.error as e:
        logging.error(f"UDP Error: {e} for {tracker_host}:{tracker_port}")
        return False, None
    finally:
        udp_socket.close()


def fetch_trackers_from_url(url):
    """
    Fetches a list of trackers from a URL.

    Args:
        url (str): The URL of the trackers list.

    Returns:
        set: A set of tracker URLs (deduplicated).
    """
    trackers = set()
    try:
        response = requests.get(url, timeout=30)
        if response.status_code == 200:
            raw_content = response.text
            for line in raw_content.split('\n'):
                line = line.strip()
                # Only add valid tracker URLs (udp://, http://, https://, wss://)
                if line and (line.startswith('udp://') or 
                            line.startswith('http://') or 
                            line.startswith('https://') or
                            line.startswith('wss://')):
                    trackers.add(line)
            logging.info(f"Fetched {len(trackers)} trackers from {url}")
        else:
            logging.error(f"Failed to fetch {url}. Status code: {response.status_code}")
    except requests.exceptions.RequestException as e:
        logging.error(f"Error fetching {url}: {e}")
    
    return trackers


def fetch_all_trackers(urls):
    """
    Fetches trackers from multiple URLs and deduplicates them.

    Args:
        urls (list): List of URLs to fetch trackers from.

    Returns:
        list: A deduplicated list of all trackers.
    """
    all_trackers = set()
    
    console.print("[dim]Loading tracker lists...[/dim]")
    for url in urls:
        trackers = fetch_trackers_from_url(url)
        all_trackers.update(trackers)
    
    return list(all_trackers)


def test_tracker(tracker):
    """
    Tests a single tracker and returns whether it's valid with response time.

    Args:
        tracker (str): The tracker URL to test.

    Returns:
        tuple: (tracker_url, is_valid, response_time_ms)
    """
    if tracker in SKIP_TRACKERS:
        return (tracker, False, None)
    
    if tracker.startswith("udp://"):
        is_valid, response_time = is_valid_udp_endpoint(tracker)
        return (tracker, is_valid, response_time)
    elif tracker.startswith("wss://"):
        # WebSocket trackers require different handling - skip for now
        logging.info(f"Skipping WebSocket tracker: {tracker}")
        return (tracker, False, None)
    else:
        is_valid, response_time = is_valid_http_tracker(tracker)
        return (tracker, is_valid, response_time)


def process_trackers_concurrent(trackers):
    """
    Tests all trackers concurrently and returns the valid ones with response times.

    Args:
        trackers (list): List of tracker URLs to test.

    Returns:
        list: A list of (tracker_url, response_time_ms) tuples for valid trackers.
    """
    valid_trackers = []  # List of (tracker, response_time) tuples
    total = len(trackers)
    
    console.print(f"\n[bold cyan]Testing {total} trackers ({MAX_WORKERS} workers)...[/bold cyan]\n")
    
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        TextColumn("•"),
        TimeRemainingColumn(),
        TextColumn("[green]Valid: {task.fields[valid]}[/green]"),
        console=console,
    ) as progress:
        task = progress.add_task("Testing", total=total, valid=0)
        
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = {executor.submit(test_tracker, tracker): tracker for tracker in trackers}
            
            valid_count = 0
            for future in as_completed(futures):
                try:
                    tracker, is_valid, response_time = future.result()
                    if is_valid and response_time is not None:
                        valid_trackers.append((tracker, response_time))
                        valid_count += 1
                    progress.update(task, advance=1, valid=valid_count)
                except Exception as e:
                    logging.error(f"Error testing tracker: {e}")
                    progress.advance(task)
    
    return valid_trackers


def show_ping_summary(trackers_with_times):
    """Display a summary of response times."""
    if not trackers_with_times:
        return
    
    times = [t[1] for t in trackers_with_times]
    times.sort()
    
    console.print("\n[bold]Response Time Summary:[/bold]")
    console.print(f"  Fastest: {times[0]:.0f}ms")
    console.print(f"  Slowest: {times[-1]:.0f}ms")
    console.print(f"  Median:  {times[len(times)//2]:.0f}ms")
    console.print(f"  Average: {sum(times)/len(times):.0f}ms")
    
    # Show distribution
    brackets = [(0, 100), (100, 250), (250, 500), (500, 1000), (1000, 2000), (2000, float('inf'))]
    console.print("\n[bold]Distribution:[/bold]")
    for low, high in brackets:
        count = len([t for t in times if low <= t < high])
        if count > 0:
            label = f"  {low}-{high}ms:" if high != float('inf') else f"  {low}ms+:"
            bar = "█" * min(count, 50)
            console.print(f"{label:12} {bar} ({count})")


def main():
    """Main entry point for the tracker testing script."""
    # Clear the log file and configure logging
    with open(LOG_FILE, 'w'):
        pass

    logging.basicConfig(
        filename=LOG_FILE,
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )

    # Fetch all trackers from all sources
    all_trackers = fetch_all_trackers(TRACKER_LISTS)
    
    if not all_trackers:
        console.print("[bold red]Error: No trackers found from any source.[/bold red]")
        return
    
    # Test all trackers concurrently
    valid_trackers = process_trackers_concurrent(all_trackers)
    
    # Show ping summary before filtering
    show_ping_summary(valid_trackers)
    
    # Filter by response time if threshold is set
    if MAX_RESPONSE_TIME_MS is not None:
        original_count = len(valid_trackers)
        valid_trackers = [(t, r) for t, r in valid_trackers if r <= MAX_RESPONSE_TIME_MS]
        filtered_count = original_count - len(valid_trackers)
        if filtered_count > 0:
            console.print(f"\n[dim]Filtered out {filtered_count} trackers slower than {MAX_RESPONSE_TIME_MS}ms[/dim]")
    
    # Sort by response time (fastest first)
    valid_trackers.sort(key=lambda x: x[1])
    
    if valid_trackers:
        # Write just the URLs to the output file
        with open(OUTPUT_FILE, "w") as file:
            file.write('\n\n'.join([t[0] for t in valid_trackers]))
        console.print(f"\n[bold green]Done! {len(valid_trackers)} trackers saved to {OUTPUT_FILE} (sorted by speed)[/bold green]")
    else:
        console.print("\n[bold red]No valid trackers found.[/bold red]")


if __name__ == "__main__":
    main()

