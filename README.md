# OpenUIL

OpenUIL is a Flask-based web application designed to provide easy access to UIL Academics competition results. It allows users to search for individual and team rankings, view school classification history (conference, region, and district by year), and track student performance across multiple years.

## Features

- **Competition Results**: Search for results by Year, Conference, Competition, and Level (District, Region, State).
- **Individual & Team Rankings**: View detailed rankings for both individual participants and school teams.
- **Comparison across Regions/State:** Compare results with individuals/teams in other districts, regions, or the rest of the state.
- **Science Subscores**: Special support for Science contest subscores (Biology, Chemistry, Physics) with individual subject rankings.
- **School Classification**: Comprehensive database of school classifications (Conference, District, Region) from 2004 to 2026.
- **Student Career Search**: Look up individual students to see their competition history and results over time.
- **Responsive Design**: A clean, dark-themed interface built with Tailwind CSS for optimal viewing on any device.

## Run locally

Clone the repository from [https://github.com/JustAA1/OpenUIL](https://github.com/JustAA1/OpenUIL):

```bash
git clone https://github.com/JustAA1/OpenUIL.git
cd OpenUIL
```

1. Install dependencies:
  ```bash
   pip install -r requirements.txt
  ```
2. Start the server:
  ```bash
   python app.py
  ```
   The app listens on **port 5001** by default.
3. Open **[http://127.0.0.1:5001](http://127.0.0.1:5001)** in your browser.

## Updates

- 05/08/2026: Fixed data loading issue
- 05/03/2026: Added 2026 Region data
- 03/28/2026: Added 2026 District data

