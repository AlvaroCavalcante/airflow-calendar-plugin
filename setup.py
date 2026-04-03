from setuptools import setup, find_packages

setup(
    name="airflow_calendar", 
    version="0.6.1",
    description="A modern and intuitive calendar interface for visualizing your DAG schedules in Apache Airflow.",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    author="Alvaro Carneiro",
    author_email='alvaroleandro250@gmail.com',
    url="https://github.com/AlvaroCavalcante/airflow-calendar-plugin",
    packages=find_packages(),
    license='Apache License 2.0',
    include_package_data=True,
    zip_safe=False,

    install_requires=[
        "apache-airflow>=2.0.0",
        "croniter==5.0.1",
        "fastapi"
    ],
    entry_points={
        "airflow.plugins": [
            "airflow_calendar = airflow_calendar:GlobalSchedulePlugin"
        ],
    },
    classifiers=[
        'Programming Language :: Python',
        'Programming Language :: Python :: 3',
        'Natural Language :: English',
        'Operating System :: OS Independent',
        'Intended Audience :: Developers',
        'Intended Audience :: Information Technology',
        'Development Status :: 4 - Beta',
        'License :: OSI Approved :: Apache Software License',
        'Topic :: System :: Benchmark',
        'Topic :: Software Development :: Libraries :: Python Modules',
        'Framework :: Apache Airflow'
    ],
    keywords=[
        'airflow',
        'python',
        'python3',
        'dag',
        'calendar',
        'apache',
        'data-engineering',
        'schedule',
        'scheduler',
        'visualization',
        'airflow-plugin'
    ]
)