"""Quick test script for Grobid parser."""
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from grobid import GrobidParser


def main():
    if len(sys.argv) < 2:
        print("Usage: python test_grobid.py <path_to_pdf>")
        sys.exit(1)

    pdf_path = Path(sys.argv[1])
    if not pdf_path.exists():
        print(f"File not found: {pdf_path}")
        sys.exit(1)

    print(f"Parsing {pdf_path}...")

    parser = GrobidParser()
    pdf_content = pdf_path.read_bytes()

    try:
        tei_xml = parser.parse_pdf(pdf_content, pdf_path.name)
        print(f"\nSuccess! Got {len(tei_xml)} characters of TEI XML")
        print("\nFirst 500 chars:")
        print(tei_xml[:500])
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
