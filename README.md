# 📅 Airflow Calendar

A sleek, intuitive, and modern calendar interface for visualizing your global DAG schedule in Apache Airflow. Stop guessing when your DAGs will run; see them all in a high-fidelity time grid inspired by the Google Calendar experience.

---

## ✨ Key Features

* **Global Timeline View**: Visualize all your DAG schedules in clear weekly or daily grids, making it easy to spot execution windows and potential load spikes.
* **Smart Info-Popup**: Instant access to critical DAG run details upon clicking an event.
    * Displays **Execution Time**, **Cron Expression**, **Estimated Duration**, and **Last Status**.
* **Intelligent Viewport Positioning**: The popup automatically detects screen edges and flips its position (up/down/left/right) to prevent being cut off by the browser window or taskbar.
* **Dynamic Precision**: Maintains close proximity to the mouse cursor for a better UX while ensuring no empty gaps between the event and the info card.
* **Color-Coded Status**: Immediate visual identification of success, failure, or "no-run" states through dynamic colors and borders.
* **Native Deep Linking**: Directly jump to the native Airflow Grid View for any specific DAG with a single click.

---

## 🚀 Installation

The recommended way to install **Airflow Calendar** is via pip to ensure all templates and metadata are correctly registered.

```bash
# Clone the repository
git clone [https://github.com/your-user/airflow-calendar.git](https://github.com/your-user/airflow-calendar.git)
cd airflow-calendar

# Install the package
pip install .
```

