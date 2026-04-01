# Analysis

Data analysis code for the GADV project. This directory contains scripts and notebooks used to process raw sensor readings, compute gravitational anomaly estimates, and compare results against satellite baseline models.

## Subdirectories

### scripts/
Python and shell scripts for batch processing of raw data files. Scripts should be reproducible and accept input/output paths as arguments so they can be run on any dataset in `data/`.

### notebooks/
Jupyter notebooks for exploratory analysis, visualisation, and result reporting. Each notebook should be self-contained and include a markdown description of its purpose at the top.

## Dependencies

```bash
pip install numpy scipy pandas matplotlib jupyter
```

A `requirements.txt` will be added here once the analysis stack is finalised.
