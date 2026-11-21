from math import asin, cos, radians, sin, sqrt

GOVERNORATES = {
    "Tunis": (36.80, 10.18), "Ariana": (36.86, 10.19), "Ben Arous": (36.75, 10.23), "Manouba": (36.81, 10.10),
    "Nabeul": (36.45, 10.73), "Zaghouan": (36.40, 10.14), "Bizerte": (37.27, 9.87), "Beja": (36.73, 9.18),
    "Jendouba": (36.50, 8.78), "Kef": (36.17, 8.70), "Siliana": (36.08, 9.37), "Sousse": (35.83, 10.64),
    "Monastir": (35.78, 10.83), "Mahdia": (35.50, 11.06), "Sfax": (34.74, 10.76), "Kairouan": (35.68, 10.10),
    "Kasserine": (35.17, 8.84), "Sidi Bouzid": (35.04, 9.49), "Gabes": (33.88, 10.10), "Medenine": (33.35, 10.50),
    "Tataouine": (32.93, 10.45), "Gafsa": (34.43, 8.78), "Tozeur": (33.92, 8.13), "Kebili": (33.70, 8.97),
}


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = radians(lat1), radians(lat2)
    a = sin((p2 - p1) / 2) ** 2 + cos(p1) * cos(p2) * sin(radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371 * asin(sqrt(a))
