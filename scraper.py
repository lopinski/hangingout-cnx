import json
import os
import datetime
import time

# En un entorno de producción, aquí importarías la librería de la API de IA (ej. Gemini o OpenAI)
# from google import genai
# client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

def extract_event_with_ai(raw_text):
    print("🤖 IA leyendo y analizando el texto del post...")
    time.sleep(1.5) # Simulamos el tiempo de procesamiento de la IA
    
    # Este es el Prompt EXACTO que le enviaríamos al modelo de lenguaje:
    prompt = f"""
    Eres un asistente experto en eventos en Chiang Mai.
    Extrae los detalles de este post de redes sociales en un formato JSON estricto:
    title, venue, time, category, type (music, workout, culture), imageUrl, attending (int), timeStatus.
    
    Texto del post:
    {raw_text}
    """
    
    print("🧠 IA extrayendo: Título, Lugar, Hora y determinando si es Gratis...")
    time.sleep(1.5)
    
    # Para esta demo (sin API Key), simulamos la respuesta perfecta de la IA basándonos en el sample_post.txt
    simulated_ai_response = {
        "id": int(datetime.datetime.now().timestamp()),
        "title": "JAZZ NIGHT UNDER THE STARS",
        "venue": "The North Gate Jazz Co-op",
        "time": "9:00 PM",
        "category": "Live Music",
        "type": "music",
        "imageUrl": "https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&q=80&w=800",
        "attending": 0,
        "timeStatus": "Tonight"
    }
    
    print("✅ ¡La IA estructuró los datos con éxito!")
    return simulated_ai_response

def main():
    print("🚀 Iniciando Scraper Automatizado...\n")
    
    # 1. Leemos el "post" nuevo (Esto en la vida real sería un scraper bajando el texto de Instagram)
    try:
        with open('sample_post.txt', 'r', encoding='utf-8') as f:
            raw_text = f.read()
    except FileNotFoundError:
        print("❌ Error: No se encontró sample_post.txt")
        return
        
    print(f"📥 Post encontrado ({len(raw_text)} caracteres).")
    
    # 2. La IA extrae los datos
    new_event = extract_event_with_ai(raw_text)
    
    # 3. Leemos la base de datos actual de la web (events.json)
    db_path = 'events.json'
    if os.path.exists(db_path):
        with open(db_path, 'r', encoding='utf-8') as f:
            events = json.load(f)
    else:
        events = []
        
    # 4. Añadimos el nuevo evento al principio de la lista
    events.insert(0, new_event)
    
    # 5. Guardamos la base de datos actualizada para que la web lo muestre instantáneamente
    with open(db_path, 'w', encoding='utf-8') as f:
        json.dump(events, f, indent=4)
        
    # También guardamos como events.js para que el navegador lo lea localmente sin errores de CORS
    with open('events.js', 'w', encoding='utf-8') as f:
        f.write(f"window.eventsData = {json.dumps(events, indent=4)};")
        
    print(f"\n🎉 ¡ÉXITO! El evento '{new_event['title']}' se ha inyectado en la página web automáticamente.")
    print("👉 Recarga la web en tu navegador y lo verás de primero.")

if __name__ == "__main__":
    main()
