import streamlit as st
import pandas as pd

st.title("🚗 Sistema de Gestión de Flota")

archivo = "flota_vehiculos.xlsx"

menu = st.sidebar.selectbox("Menú", ["Vehículos", "Documentos", "Checklist Preoperativo", "Mantenimientos"])

# ================= VEHICULOS =================
if menu == "Vehículos":
    st.subheader("Registro de Vehículos")

    placa = st.text_input("Placa")
    marca = st.text_input("Marca")
    modelo = st.text_input("Modelo")

    if st.button("Guardar Vehículo"):
        df = pd.read_excel(archivo, sheet_name="vehiculos")
        nuevo = pd.DataFrame([[len(df)+1, placa, "", "", marca, "", "", "", modelo, "", "", "", "", ""]], columns=df.columns)
        df = pd.concat([df, nuevo], ignore_index=True)
        df.to_excel(archivo, sheet_name="vehiculos", index=False)
        st.success("Vehículo guardado ✅")

    st.subheader("Datos actuales")
    st.dataframe(pd.read_excel(archivo, sheet_name="vehiculos"))

# ================= DOCUMENTOS =================
elif menu == "Documentos":
    st.subheader("Documentos del Vehículo")

    id_vehiculo = st.number_input("ID Vehículo")
    soat = st.date_input("SOAT")
    tecnomecanica = st.date_input("Tecnomecánica")

    if st.button("Guardar Documento"):
        df = pd.read_excel(archivo, sheet_name="documentos")
        nuevo = pd.DataFrame([[id_vehiculo, soat, tecnomecanica, "", ""]], columns=df.columns)
        df = pd.concat([df, nuevo], ignore_index=True)
        df.to_excel(archivo, sheet_name="documentos", index=False)
        st.success("Documento guardado ✅")

    st.dataframe(pd.read_excel(archivo, sheet_name="documentos"))

# ================= CHECKLIST =================
elif menu == "Checklist Preoperativo":
    st.subheader("Checklist Diario")

    id_vehiculo = st.number_input("ID Vehículo")
    luces = st.selectbox("Luces", ["Bueno", "Regular", "Malo"])
    frenos = st.selectbox("Frenos", ["Bueno", "Regular", "Malo"])

    if st.button("Guardar Checklist"):
        df = pd.read_excel(archivo, sheet_name="checklist_preoperativo")
        nuevo = pd.DataFrame([[id_vehiculo, luces, "", "", frenos, "", "", "", "", ""]], columns=df.columns)
        df = pd.concat([df, nuevo], ignore_index=True)
        df.to_excel(archivo, sheet_name="checklist_preoperativo", index=False)
        st.success("Checklist guardado ✅")

    st.dataframe(pd.read_excel(archivo, sheet_name="checklist_preoperativo"))

# ================= MANTENIMIENTOS =================
elif menu == "Mantenimientos":
    st.subheader("Registro de Mantenimiento")

    id_vehiculo = st.number_input("ID Vehículo")
    fecha = st.date_input("Fecha")
    actividad = st.text_input("Actividad realizada")

    if st.button("Guardar Mantenimiento"):
        df = pd.read_excel(archivo, sheet_name="checklist_mantenimientos")
        nuevo = pd.DataFrame([[id_vehiculo, fecha, "", actividad, "", "", "", "", "", ""]], columns=df.columns)
        df = pd.concat([df, nuevo], ignore_index=True)
        df.to_excel(archivo, sheet_name="checklist_mantenimientos", index=False)
        st.success("Mantenimiento guardado ✅")

    st.dataframe(pd.read_excel(archivo, sheet_name="checklist_mantenimientos"))