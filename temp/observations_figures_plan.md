# Implementation Plan: Add Figure/Table Support to Observation Extraction

## Overview
Enable observation extraction to process figure and table images from papers, allowing the LLM to extract empirical observations from visual elements (charts, graphs, result tables, etc.).

## Background
- Figures/tables are already extracted during parsing and stored at `{paper_id}/figures/{xml_id}.png`
- Filename equals the TEI `xml:id` (e.g., `fig_0.png` → `xml:id="fig_0"`)
- LLM can reference figures by returning `element_id` matching the filename

## Input Schema for Image Metadata
```python
{
    "image_title": str,    # e.g., "fig_0" (same as filename without .png)
    "element_id": str,     # same as image_title (explicit for LLM output mapping)
    "caption": str,        # extracted from TEI <head> + <figDesc>
    "type": str            # "figure" or "table"
}
```

---

## File Changes

### 1. `api/services/extract/utils.py`

**Add function: `get_figure_metadata(root: ET.Element) -> list[dict]`**

- Parse all `<figure>` elements from TEI
- Extract `xml:id` attribute → `image_title` and `element_id`
- Extract caption from `<head>` and `<figDesc>` child elements
- Determine type from `type` attribute (default "figure", or "table" if `type="table"`)
- Return list of metadata dicts

```python
def get_figure_metadata(root: ET.Element) -> list[dict]:
    """
    Extract metadata for all figures/tables from TEI.

    Returns list of {image_title, element_id, caption, type}
    """
    figures = root.findall(f".//{{{TEI_NS}}}figure")
    metadata = []

    for fig in figures:
        fig_id = fig.get(f"{{{XML_NS}}}id")
        if not fig_id:
            continue

        # Get caption from <head> and <figDesc>
        head = fig.find(f"{{{TEI_NS}}}head")
        fig_desc = fig.find(f"{{{TEI_NS}}}figDesc")
        caption_parts = []
        if head is not None and head.text:
            caption_parts.append(head.text.strip())
        if fig_desc is not None:
            desc_text = "".join(fig_desc.itertext()).strip()
            if desc_text:
                caption_parts.append(desc_text)

        caption = " ".join(caption_parts)
        fig_type = fig.get("type", "figure")

        metadata.append({
            "image_title": fig_id,
            "element_id": fig_id,
            "caption": caption,
            "type": fig_type,
        })

    return metadata
```

---

### 2. `api/db/queries/storage.py`

**Add method: `get_paper_figures(paper_id: str) -> list[dict]`**

- List all files in `{paper_id}/figures/` directory
- Download each image
- Return list of `{"id": str, "bytes": bytes}`

```python
def get_paper_figures(self, paper_id: str) -> list[dict]:
    """
    Get all figure/table images for a paper.

    Returns list of {"id": str, "bytes": bytes}
    """
    folder = f"{paper_id}/figures"
    files = self.list_files(folder)

    results = []
    for f in files:
        filename = f.get("name", "")
        if not filename.endswith(".png"):
            continue
        fig_id = filename.replace(".png", "")
        image_bytes = self.download(f"{folder}/{filename}")
        results.append({"id": fig_id, "bytes": image_bytes})

    return results
```

---

### 3. `api/services/extract/observations.py`

#### 3a. Update imports

```python
import dspy
# Add dspy.Image import (check exact import path from existing code)
```

#### 3b. Update `ExtractObservations` signature

Add three new input fields:

```python
class ExtractObservations(dspy.Signature):
    """...(existing docstring - update to mention figures/tables)..."""

    paper_content: str = dspy.InputField(desc="Parsed sections from the paper with element IDs")
    methods: str = dspy.InputField(desc="Previously extracted methods from this paper")

    # NEW: Visual inputs
    figures: list[dspy.Image] = dspy.InputField(
        desc="Figure images from the paper that may contain results"
    )
    tables: list[dspy.Image] = dspy.InputField(
        desc="Table images from the paper that may contain results"
    )
    image_metadata: list[dict] = dspy.InputField(
        desc="Metadata for each image: {image_title, element_id, caption, type}. Use element_id as source_element_id when referencing."
    )

    observations: list[Observation] = dspy.OutputField(desc="List of extracted observations with source references")
```

#### 3c. Update `ObservationsExtractor` class

```python
class ObservationsExtractor(dspy.Module):
    def __init__(self):
        super().__init__()
        self.extract = dspy.Predict(ExtractObservations)

    def forward(
        self,
        paper_content: str,
        methods: str,
        figures: list = None,
        tables: list = None,
        image_metadata: list = None,
    ) -> list[Observation]:
        figures = figures or []
        tables = tables or []
        image_metadata = image_metadata or []

        result = self.extract(
            paper_content=paper_content,
            methods=methods,
            figures=figures,
            tables=tables,
            image_metadata=image_metadata,
        )
        return result.observations
```

#### 3d. Update `extract_observations_from_paper()` function

Add logic after fetching TEI:

```python
# After parsing TEI and before extraction:

# Fetch figure metadata from TEI
from services.extract.utils import get_figure_metadata
all_image_metadata = get_figure_metadata(root)

# Fetch figure bytes from storage
figure_data = storage.get_paper_figures(paper_id)

# Convert to dspy.Image objects and split by type
figures = []
tables = []
figure_id_to_bytes = {f["id"]: f["bytes"] for f in figure_data}

for meta in all_image_metadata:
    fig_id = meta["element_id"]
    if fig_id not in figure_id_to_bytes:
        continue  # No screenshot available for this figure

    image = dspy.Image.from_bytes(figure_id_to_bytes[fig_id])  # or appropriate method

    if meta["type"] == "table":
        tables.append(image)
    else:
        figures.append(image)

# Update extractor calls to include new parameters
observations = extractor(
    paper_content=paper_content,
    methods=methods,
    figures=figures,
    tables=tables,
    image_metadata=all_image_metadata,
)
```

#### 3e. Handle chunked extraction

When processing chunks (no results section), pass the same figures/tables/metadata to each chunk call.

---

## Testing

1. Test `get_figure_metadata()` with example TEI containing figures and tables
2. Test `get_paper_figures()` with a paper that has extracted screenshots
3. Test full extraction pipeline with a paper containing result figures
4. Verify LLM returns valid `element_id` values that match figure filenames

---

## Notes

- Check exact `dspy.Image` API for loading from bytes vs file path
- May need to handle case where figure has no coords (no screenshot extracted)
- Consider token/context limits when passing many large images
- Image order in `figures`/`tables` lists should match order in `image_metadata`
