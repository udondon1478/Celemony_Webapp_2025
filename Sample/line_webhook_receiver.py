import requests
import json

def receive_line_webhook(webhook_url):
    """
    Receives a LINE Webhook event and prints the data to the terminal.
    """
    try:
        response = requests.post(webhook_url, data=requests.get(webhook_url).text)
        response.raise_for_status()  # Raise HTTPError for bad responses (4xx or 5xx)
        data = response.json()
        print(json.dumps(data, indent=2))
    except requests.exceptions.RequestException as e:
        print(f"Error receiving webhook: {e}")

# Replace with your actual webhook URL
webhook_url = "https://line.udondon.net/test"  # Replace this with the actual URL

receive_line_webhook(webhook_url)