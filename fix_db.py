import re

with open("sig_kacang_panjang_api/main.py", "r") as f:
    content = f.read()

# Fix get_layer_geojson
content = re.sub(
    r"""    try:\n        conn = get_db_connection\(\)\n        cur = conn.cursor\(\)\n        query = f\"\"\"\n            SELECT jsonb_build_object\((.*?)\)\n            FROM \(\n              SELECT jsonb_build_object\((.*?)\) AS feature\n              FROM \(SELECT \* FROM \{nama_layer\}\) inputs\n            \) features;\n        \"\"\"\n        cur.execute\(query\)\n        result = cur.fetchone\(\)\[0\]\n        cur.close\(\)\n        conn.close\(\)\n        return result\n    except Exception as e:\n        return \{"status": "error", "message": str\(e\)\}""",
    r"""    conn = None\n    try:\n        conn = get_db_connection()\n        cur = conn.cursor()\n        query = f\"\"\"\n            SELECT jsonb_build_object(\1)\n            FROM (\n              SELECT jsonb_build_object(\2) AS feature\n              FROM (SELECT * FROM {nama_layer}) inputs\n            ) features;\n        \"\"\"\n        cur.execute(query)\n        result = cur.fetchone()[0]\n        cur.close()\n        return result\n    except Exception as e:\n        return {"status": "error", "message": str(e)}\n    finally:\n        if conn:\n            conn.close()""",
    content, flags=re.DOTALL
)

# Replace all simple try blocks containing conn = get_db_connection()...
def add_finally(match):
    body = match.group(1)
    body = body.replace('        conn.close()\n', '')
    return f"""    conn = None\n    try:{body}    finally:\n        if conn:\n            conn.close()"""

content = re.sub(r'    try:(.*?conn = get_db_connection\(\).*?return.*?except Exception as e:.*?return \{.*?\})', add_finally, content, flags=re.DOTALL)

with open("sig_kacang_panjang_api/main.py", "w") as f:
    f.write(content)
