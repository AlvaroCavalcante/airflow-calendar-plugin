from setuptools import setup, find_packages

setup(
    name="airflow_calendar", 
    version="0.2.0",
    description="A sleek, Google Calendar-inspired global view for Apache Airflow DAGs.",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    author="Alvaro Carneiro",
    url="https://github.com/AlvaroCavalcante/airflow-calendar-plugin",
    packages=find_packages(),
    include_package_data=True,
    zip_safe=False,
    install_requires=[
        "apache-airflow>=2.0.0",
    ],
    entry_points={
        "airflow.plugins": [
            "airflow_calendar = airflow_calendar:GlobalSchedulePlugin"
        ],
    },
    classifiers=[
        "Framework :: Apache Airflow",
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
    ],
)