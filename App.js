import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable,
  ScrollView, StatusBar, StyleSheet, Text, TextInput, View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Contacts from 'expo-contacts';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { deleteContact, deleteGroup, exportData, getDatabase, importData, listContacts, listGroups, listRecentlyDeleted, restoreContact, permanentlyDeleteContact, saveContact, saveGroup } from './src/database';

const C = { blue:'#2563EB', pale:'#EFF6FF', bg:'#F5F7FB', ink:'#172033', muted:'#7B8496', line:'#E7EAF0', white:'#FFFFFF', red:'#DC2626', green:'#16A34A' };
const emptyForm = { first_name:'', last_name:'', phone:'', email:'', address:'', company:'', job_title:'', notes:'', favorite:false, group_id:null, group_ids:[], photo_uri:null };
const initials = c => ((c.first_name?.[0] || '') + (c.last_name?.[0] || '')).toUpperCase() || '?';

function Action({ icon, label, onPress, tint=C.blue, styles }) {
  return <Pressable onPress={onPress} style={styles.action}><View style={[styles.actionIcon,{backgroundColor:tint+'15'}]}><Ionicons name={icon} size={20} color={tint}/></View><Text style={styles.actionText}>{label}</Text></Pressable>;
}
function ContactRow({ item, onPress, onFavorite, styles }) {
  return <Pressable style={styles.contactRow} onPress={onPress}>
    <View style={styles.avatar}>{item.photo_uri ? <Image source={{uri:item.photo_uri}} style={styles.avatarImage}/> : <Text style={styles.avatarText}>{initials(item)}</Text>}</View>
    <View style={{flex:1}}><Text style={styles.contactName}>{item.first_name} {item.last_name}</Text><Text style={styles.contactSub}>{item.phone || item.email || 'No phone or email'}</Text></View>
    <Pressable hitSlop={12} onPress={onFavorite}><Ionicons name={item.favorite ? 'heart' : 'heart-outline'} size={22} color={item.favorite ? '#EF476F' : '#9AA3B2'}/></Pressable>
    <Ionicons name="chevron-forward" size={18} color="#AAB2C0" style={{marginLeft:10}}/>
  </Pressable>;
}
function Field({ label, value, onChangeText, placeholder, keyboardType, multiline, styles }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder || label} placeholderTextColor="#AAB2C0" keyboardType={keyboardType || 'default'} multiline={multiline} style={[styles.input,multiline && {height:88,textAlignVertical:'top'}]}/></View>;
}
function PrimaryButton({ title, onPress, icon='checkmark', danger=false, styles }) {
  return <Pressable onPress={onPress} style={[styles.primaryButton,danger && {backgroundColor:C.red}]}><Ionicons name={icon} size={18} color="white"/><Text style={styles.primaryText}>{title}</Text></Pressable>;
}

export default function App() {
  const [tab,setTab] = useState('Home');
  const [contacts,setContacts] = useState([]);
  const [deletedContacts,setDeletedContacts] = useState([]);
  const [groups,setGroups] = useState([]);
  const [search,setSearch] = useState('');
  const [filterGroup,setFilterGroup] = useState(null);
  const [favoriteOnly,setFavoriteOnly] = useState(false);
  const [modal,setModal] = useState(null);
  const [selected,setSelected] = useState(null);
  const [form,setForm] = useState(emptyForm);
  const [groupName,setGroupName] = useState('');
  const [editingGroupId,setEditingGroupId] = useState(null);
  const [sortRecent,setSortRecent] = useState(false);
  const [darkMode,setDarkMode] = useState(false);
  const [themeLoaded,setThemeLoaded] = useState(false);
  const palette = darkMode ? {...C, bg:'#101827', white:'#1B2638', ink:'#F3F6FC', muted:'#A6B1C2', line:'#334155', pale:'#263B59'} : C;
  const s = useMemo(() => createStyles(palette), [darkMode]);
  useEffect(() => { let active=true; AsyncStorage.getItem('contact-manager-theme').then(value => { if(active) setDarkMode(value === 'dark'); }).catch(()=>{}).finally(()=>{ if(active) setThemeLoaded(true); }); return () => { active=false; }; }, []);
  useEffect(() => { if(themeLoaded) AsyncStorage.setItem('contact-manager-theme', darkMode ? 'dark' : 'light').catch(()=>{}); }, [darkMode,themeLoaded]);

  const refresh = async () => {
    try {
      await getDatabase();
      const [all, gs, deleted] = await Promise.all([listContacts({search, favorite:favoriteOnly, groupId:filterGroup}),listGroups(),listRecentlyDeleted()]);
      setContacts(all); setGroups(gs); setDeletedContacts(deleted);
    } catch (e) { Alert.alert('Database error',e.message); }
  };
  useEffect(() => { refresh(); }, [search, favoriteOnly, filterGroup]);
  const ordered = useMemo(() => sortRecent ? [...contacts].sort((a,b)=>b.id-a.id) : contacts, [contacts,sortRecent]);
  const openNew = () => { setForm(emptyForm); setModal('form'); };
  const openEdit = c => { const ids=(c.group_ids||'').split(',').filter(Boolean); setForm({...c,group_id:null,group_ids:ids, favorite:!!c.favorite}); setModal('form'); };
  const update = (key,value) => setForm(old=>({...old,[key]:value}));
  const chooseContactPhoto = async source => {
    try {
      let result;
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) return Alert.alert('Camera permission needed','Allow camera access to take a contact photo.');
        result = await ImagePicker.launchCameraAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:0.85});
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) return Alert.alert('Photo permission needed','Allow photo library access to choose a contact picture.');
        result = await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:0.85});
      }
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const sourceUri=result.assets[0].uri;
      const directory=FileSystem.documentDirectory+'contact-photos/';
      await FileSystem.makeDirectoryAsync(directory,{intermediates:true});
      const extension=(sourceUri.split('.').pop()||'jpg').split('?')[0];
      const destination=directory+'contact-'+Date.now()+'.'+extension;
      await FileSystem.copyAsync({from:sourceUri,to:destination});
      update('photo_uri',destination);
    } catch(error) { Alert.alert('Unable to add photo',error.message || 'Please try again.'); }
  };
  const showPhotoOptions = () => Alert.alert('Contact picture','Choose how to add a picture.',[
    {text:'Take a photo',onPress:()=>chooseContactPhoto('camera')},
    {text:'Choose from gallery',onPress:()=>chooseContactPhoto('gallery')},
    ...(form.photo_uri ? [{text:'Remove picture',style:'destructive',onPress:()=>update('photo_uri',null)}] : []),
    {text:'Cancel',style:'cancel'}
  ]);
  const toggleContactGroup = id => setForm(old=>({...old,group_ids:(old.group_ids||[]).includes(String(id)) ? old.group_ids.filter(x=>x!==String(id)) : [...(old.group_ids||[]),String(id)]}));
  const submitContact = async () => {
    if (!form.first_name.trim()) return Alert.alert('Required field','Please enter a first name.');
    if (!form.phone.trim() && !form.email.trim()) return Alert.alert('Contact method required','Enter a phone number or email address.');
    try { await saveContact(form); setModal(null); setSelected(null); refresh(); }
    catch(e) { Alert.alert('Unable to save',e.message); }
  };
  const toggleFavorite = async c => { await saveContact({...c,favorite:!c.favorite,group_id:c.group_id}); refresh(); if(selected?.id===c.id) setSelected({...c,favorite:!c.favorite}); };
  const confirmDelete = c => Alert.alert('Move to Recently Deleted?',`“${c.first_name} ${c.last_name}” will stay here for 30 days. You can restore it during that time.`,[{text:'Cancel',style:'cancel'},{text:'Move to Recently Deleted',style:'destructive',onPress:async()=>{await deleteContact(c.id);setSelected(null);setModal(null);refresh();}}]);
  const restoreDeleted = async c => { try { await restoreContact(c.id); await refresh(); Alert.alert('Contact restored', `${c.first_name} ${c.last_name} is back in your contacts.`); } catch(e) { Alert.alert('Restore failed',e.message); } };
  const permanentlyDelete = c => Alert.alert('Delete permanently?', 'This cannot be undone.', [{text:'Cancel',style:'cancel'},{text:'Delete permanently',style:'destructive',onPress:async()=>{await permanentlyDeleteContact(c.id);refresh();}}]);
  const daysLeft = deletedAt => Math.max(0,30-Math.floor((Date.now()-new Date(deletedAt).getTime())/86400000));
  const addGroup = async () => {
    if (!groupName.trim()) return;
    try { await saveGroup(groupName, editingGroupId); setGroupName(''); setEditingGroupId(null); refresh(); }
    catch(e) { Alert.alert('Group not saved','A group with that name may already exist.'); }
  };
  const importPhoneContacts = async () => {
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (permission.status !== 'granted') return Alert.alert('Permission needed','Allow Contacts access to import people from your Android address book.');
      const result = await Contacts.getContactsAsync({fields:[Contacts.Fields.Name,Contacts.Fields.PhoneNumbers,Contacts.Fields.Emails]});
      const usable = (result.data||[]).filter(c=>c.name && ((c.phoneNumbers||[]).length || (c.emails||[]).length));
      if (!usable.length) return Alert.alert('No contacts found','No phone contacts with a phone number or email were found.');
      Alert.alert('Import phone contacts', 'Import '+usable.length+' contacts from your Android address book? Existing matching contacts will be skipped.', [
        {text:'Cancel',style:'cancel'},
        {text:'Import',onPress:async()=>{let added=0,skipped=0;try{for(const c of usable){const parts=(c.name||'').trim().split(' ');const first=parts.shift()||'Contact';const last=parts.join(' ');const phone=c.phoneNumbers?.[0]?.number||'';const email=c.emails?.[0]?.email||'';const exists=contacts.some(x=>(phone && x.phone===phone)||(email && x.email.toLowerCase()===email.toLowerCase()));if(exists){skipped++;continue;}await saveContact({...emptyForm,first_name:first,last_name:last,phone,email,group_ids:[]});added++;}await refresh();Alert.alert('Import complete',added+' contacts imported. '+skipped+' matching contacts skipped.');}catch(e){Alert.alert('Import incomplete',e.message);}}}
      ]);
    } catch(e) { Alert.alert('Import failed',e.message); }
  };
  const backup = async () => {
    try {
      const data = await exportData();
      const path = FileSystem.cacheDirectory + 'contact-manager-backup-' + Date.now() + '.json';
      await FileSystem.writeAsStringAsync(path,JSON.stringify(data,null,2));
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path,{mimeType:'application/json',dialogTitle:'Export contacts backup'});
      else Alert.alert('Backup created',path);
    } catch(e) { Alert.alert('Backup failed',e.message); }
  };
  const restore = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({type:['application/json','text/json'],copyToCacheDirectory:true});
      if (picked.canceled) return;
      const raw = await FileSystem.readAsStringAsync(picked.assets[0].uri);
      const data = JSON.parse(raw);
      Alert.alert('Restore backup','Import contacts and groups? Existing contacts will be kept; matching contacts are skipped.',[
        {text:'Cancel',style:'cancel'},
        {text:'Restore',onPress:async()=>{try{await importData(data);refresh();Alert.alert('Restore complete','Backup data has been imported.');}catch(e){Alert.alert('Restore failed',e.message);}}}
      ]);
    } catch(e) { Alert.alert('Could not read backup',e.message); }
  };
  const openContact = c => { setSelected(c); setModal('details'); };
  const call = c => c.phone ? Linking.openURL('tel:'+c.phone) : Alert.alert('No phone number','This contact has no phone number.');
  const sms = c => c.phone ? Linking.openURL('sms:'+c.phone) : Alert.alert('No phone number','This contact has no phone number.');
  const email = c => c.email ? Linking.openURL('mailto:'+c.email) : Alert.alert('No email','This contact has no email address.');

  const visibleContacts = tab==='Favorites' ? contacts.filter(c=>c.favorite) : ordered;
  const heading = tab==='Home' ? 'Your contacts' : tab;
  const showList = ['Home','Contacts','Favorites'].includes(tab);

  return <SafeAreaView style={[s.safe,{backgroundColor:palette.bg}]}>
    <ExpoStatusBar style={darkMode ? "light" : "dark"}/><StatusBar barStyle={darkMode ? "light-content" : "dark-content"} backgroundColor={palette.bg}/>
    <View style={s.header}>
      <View><Text style={s.eyebrow}>CONTACT MANAGER</Text><Text style={s.title}>{heading}</Text></View>
      <Pressable style={s.headerAdd} onPress={openNew}><Ionicons name="person-add" size={21} color="white"/></Pressable>
    </View>
    {showList ? <>
      <View style={s.searchBox}><Ionicons name="search" size={19} color={C.muted}/><TextInput value={search} onChangeText={setSearch} placeholder="Search name, phone, email..." placeholderTextColor="#9AA3B2" style={s.searchInput}/>{search ? <Pressable onPress={()=>setSearch('')}><Ionicons name="close-circle" size={19} color={C.muted}/></Pressable> : null}</View>
      <View style={s.quickFilters}>
        <Pressable onPress={()=>{setFavoriteOnly(false);setFilterGroup(null);setTab('Contacts')}} style={[s.chip,!favoriteOnly && !filterGroup && tab!=='Favorites' && s.chipActive]}><Text style={[s.chipText,!favoriteOnly && !filterGroup && tab!=='Favorites' && s.chipTextActive]}>All</Text></Pressable>
        <Pressable onPress={()=>{setFavoriteOnly(true);setFilterGroup(null);setTab('Favorites')}} style={[s.chip,tab==='Favorites' && s.chipActive]}><Text style={[s.chipText,tab==='Favorites' && s.chipTextActive]}>♥ Favorites</Text></Pressable>
        <Pressable onPress={()=>setSortRecent(v=>!v)} style={s.chip}><Text style={s.chipText}>{sortRecent?'Recently added':'A–Z'}</Text></Pressable>
      </View>
      {tab==='Home' && <View style={s.summary}><View><Text style={s.summaryNumber}>{contacts.length}</Text><Text style={s.summaryLabel}>Saved contacts</Text></View><View style={s.summaryDivider}/><View><Text style={s.summaryNumber}>{contacts.filter(c=>c.favorite).length}</Text><Text style={s.summaryLabel}>Favorites</Text></View><View style={s.summaryIcon}><Ionicons name="people" size={28} color={C.blue}/></View></View>}
      <FlatList data={visibleContacts} keyExtractor={item=>String(item.id)} contentContainerStyle={{paddingHorizontal:20,paddingBottom:110}} ListHeaderComponent={<Text style={s.sectionLabel}>{tab==='Favorites'?'FAVORITE CONTACTS':'ALL CONTACTS'} · {visibleContacts.length}</Text>} ListEmptyComponent={<View style={s.empty}><Ionicons name="people-outline" size={42} color="#AAB2C0"/><Text style={s.emptyTitle}>No contacts yet</Text><Text style={s.emptyText}>Add a contact to get started.</Text><PrimaryButton styles={s} title="Add contact" icon="add" onPress={openNew}/></View>} renderItem={({item})=><ContactRow styles={s} item={item} onPress={()=>openContact(item)} onFavorite={()=>toggleFavorite(item)}/>} />
    </> : tab==='Groups' ? <ScrollView contentContainerStyle={s.page}>
      <Text style={s.helper}>Organize people into groups to find them faster.</Text>
      <View style={s.groupCreate}><TextInput value={groupName} onChangeText={setGroupName} placeholder="New group name" style={[s.input,{flex:1,marginBottom:0}]}/><Pressable onPress={addGroup} style={s.addGroup}><Ionicons name={editingGroupId?'checkmark':'add'} size={22} color="white"/></Pressable></View>
      {groups.map(g=><Pressable key={g.id} style={s.groupRow} onPress={()=>{setFilterGroup(g.id);setFavoriteOnly(false);setTab('Contacts')}}><View style={s.groupIcon}><Ionicons name="people" size={20} color={C.blue}/></View><View style={{flex:1}}><Text style={s.contactName}>{g.name}</Text><Text style={s.contactSub}>{g.member_count} members</Text></View><Pressable hitSlop={10} onPress={()=>{setGroupName(g.name);setEditingGroupId(g.id);}}><Ionicons name="create-outline" color={C.blue} size={19} style={{marginRight:12}}/></Pressable><Ionicons name="chevron-forward" size={18} color={C.muted}/><Pressable hitSlop={10} onPress={()=>Alert.alert('Delete group?',`Remove the group “${g.name}”? Contacts will remain saved.`,[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:async()=>{await deleteGroup(g.id);refresh();}}])}><Ionicons name="trash-outline" color={C.red} size={18} style={{marginLeft:14}}/></Pressable></Pressable>)}
    </ScrollView> : tab==='Recently Deleted' ? <FlatList data={deletedContacts} keyExtractor={item=>String(item.id)} contentContainerStyle={{paddingHorizontal:20,paddingBottom:110}} ListHeaderComponent={<View><Text style={s.helper}>Deleted contacts stay here for 30 days. Restore them before the time expires, or delete them permanently.</Text><Text style={s.sectionLabel}>RECENTLY DELETED · {deletedContacts.length}</Text></View>} ListEmptyComponent={<View style={s.empty}><Ionicons name="trash-outline" size={42} color="#AAB2C0"/><Text style={s.emptyTitle}>Nothing deleted</Text><Text style={s.emptyText}>Contacts you delete will appear here for 30 days.</Text></View>} renderItem={({item})=><View style={s.contactRow}><View style={s.avatar}><Text style={s.avatarText}>{initials(item)}</Text></View><View style={{flex:1}}><Text style={s.contactName}>{item.first_name} {item.last_name}</Text><Text style={s.contactSub}>{daysLeft(item.deleted_at)} days left to restore</Text></View><Pressable onPress={()=>restoreDeleted(item)} style={s.restoreButton}><Ionicons name="refresh" size={17} color={C.blue}/><Text style={s.restoreText}>Restore</Text></Pressable><Pressable onPress={()=>permanentlyDelete(item)} hitSlop={10} style={{padding:8}}><Ionicons name="trash-outline" size={19} color={C.red}/></Pressable></View>} /> : <ScrollView contentContainerStyle={s.page}>
      <Text style={s.sectionLabel}>APPEARANCE</Text><View style={s.settingCard}><Text style={[s.contactName,{marginBottom:5}]}>Choose app theme</Text><Text style={[s.contactSub,{marginBottom:14}]}>Your choice is saved automatically and used next time you open the app.</Text><View style={{flexDirection:"row",gap:10}}><Pressable accessibilityRole="button" accessibilityState={{selected:!darkMode}} onPress={()=>setDarkMode(false)} style={{flex:1,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,paddingVertical:13,borderRadius:12,borderWidth:1,borderColor:!darkMode?C.blue:palette.line,backgroundColor:!darkMode?palette.pale:palette.white}}><Ionicons name="sunny" size={19} color={!darkMode?C.blue:palette.muted}/><Text style={{fontSize:14,fontWeight:"700",color:!darkMode?C.blue:palette.ink}}>Light</Text>{!darkMode&&<Ionicons name="checkmark-circle" size={17} color={C.blue}/>}</Pressable><Pressable accessibilityRole="button" accessibilityState={{selected:darkMode}} onPress={()=>setDarkMode(true)} style={{flex:1,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,paddingVertical:13,borderRadius:12,borderWidth:1,borderColor:darkMode?C.blue:palette.line,backgroundColor:darkMode?palette.pale:palette.white}}><Ionicons name="moon" size={19} color={darkMode?C.blue:palette.muted}/><Text style={{fontSize:14,fontWeight:"700",color:darkMode?C.blue:palette.ink}}>Dark</Text>{darkMode&&<Ionicons name="checkmark-circle" size={17} color={C.blue}/>}</Pressable></View></View><Text style={s.sectionLabel}>DATA & PREFERENCES</Text>
      <View style={s.settingCard}><Action styles={s} icon="person-add-outline" label="Import from phone contacts" onPress={importPhoneContacts}/><View style={s.divider}/><Action styles={s} icon="cloud-download-outline" label="Back up contacts" onPress={backup}/><View style={s.divider}/><Action styles={s} icon="cloud-upload-outline" label="Restore from backup" onPress={restore}/><View style={s.divider}/><Action styles={s} icon="trash-outline" label={'Recently deleted ('+deletedContacts.length+')'} onPress={()=>setTab('Recently Deleted')} tint={C.red}/></View>
      <Text style={s.sectionLabel}>ABOUT</Text><View style={s.settingCard}><Text style={s.aboutTitle}>Contact Manager</Text><Text style={s.helper}>Offline-first contact organizer. Your contacts stay on this device unless you choose to export a backup.</Text><Text style={s.version}>Version 1.0.0</Text></View>
    </ScrollView>}
    <View style={s.tabBar}>{[['Home','home-outline'],['Contacts','people-outline'],['Groups','grid-outline'],['Favorites','heart-outline'],['Settings','settings-outline']].map(([name,icon])=><Pressable key={name} onPress={()=>{setTab(name);setFavoriteOnly(name==='Favorites');if(name!=='Contacts')setFilterGroup(null);}} style={s.tabItem}><Ionicons name={icon} size={21} color={tab===name?C.blue:'#929AAA'}/><Text style={[s.tabLabel,tab===name&&{color:C.blue,fontWeight:'700'}]}>{name}</Text></Pressable>)}</View>

    <Modal visible={modal==='form'} animationType="slide" onRequestClose={()=>setModal(null)}>
      <SafeAreaView style={s.modalSafe}><View style={s.modalHeader}><Pressable onPress={()=>setModal(null)}><Ionicons name="close" size={25} color={C.ink}/></Pressable><Text style={s.modalTitle}>{form.id?'Edit contact':'New contact'}</Text><View style={{width:25}}/></View>
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={s.formPage} keyboardShouldPersistTaps="handled">
          <Pressable onPress={showPhotoOptions} style={s.photoPicker}><View style={s.bigAvatar}>{form.photo_uri ? <Image source={{uri:form.photo_uri}} style={s.bigAvatarImage}/> : <Text style={s.bigAvatarText}>{initials(form)}</Text>}<View style={s.photoCamera}><Ionicons name="camera" size={16} color="white"/></View></View><Text style={s.photoPickerText}>{form.photo_uri ? "Change contact picture" : "Add contact picture"}</Text></Pressable>
          <Field styles={s} label="First name *" value={form.first_name} onChangeText={v=>update('first_name',v)}/><Field styles={s} label="Last name" value={form.last_name} onChangeText={v=>update('last_name',v)}/>
          <Field styles={s} label="Phone number" value={form.phone} onChangeText={v=>update('phone',v)} keyboardType="phone-pad"/><Field styles={s} label="Email address" value={form.email} onChangeText={v=>update('email',v)} keyboardType="email-address"/>
          <Field styles={s} label="Company" value={form.company} onChangeText={v=>update('company',v)}/><Field styles={s} label="Job title" value={form.job_title} onChangeText={v=>update('job_title',v)}/><Field styles={s} label="Address" value={form.address} onChangeText={v=>update('address',v)}/>
          <Text style={s.label}>Contact groups (select any number)</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:14}}><Pressable onPress={()=>update('group_ids',[])} style={[s.chip,!(form.group_ids||[]).length&&s.chipActive]}><Text style={[s.chipText,!(form.group_ids||[]).length&&s.chipTextActive]}>None</Text></Pressable>{groups.map(g=>{const active=(form.group_ids||[]).includes(String(g.id));return <Pressable key={g.id} onPress={()=>toggleContactGroup(g.id)} style={[s.chip,{marginLeft:7},active&&s.chipActive]}><Text style={[s.chipText,active&&s.chipTextActive]}>{active?'✓ ':''}{g.name}</Text></Pressable>;})}</ScrollView>
          <Field styles={s} label="Notes" value={form.notes} onChangeText={v=>update('notes',v)} multiline/>
          <Pressable style={s.favoriteToggle} onPress={()=>update('favorite',!form.favorite)}><Ionicons name={form.favorite?'heart':'heart-outline'} size={21} color="#EF476F"/><Text style={s.contactName}>Add to favorites</Text><View style={{flex:1}}/><Ionicons name={form.favorite?'checkbox':'square-outline'} size={22} color={C.blue}/></Pressable>
          <PrimaryButton styles={s} title={form.id?'Save changes':'Save contact'} onPress={submitContact}/>
        </ScrollView></KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>

    <Modal visible={modal==='details'} animationType="slide" transparent onRequestClose={()=>setModal(null)}>
      <View style={s.overlay}><View style={s.detailSheet}><View style={s.sheetHandle}/><Pressable style={s.closeDetail} onPress={()=>setModal(null)}><Ionicons name="close" size={23} color={C.ink}/></Pressable>
        {selected && <ScrollView contentContainerStyle={{paddingBottom:24}}><View style={s.detailAvatar}>{selected.photo_uri ? <Image source={{uri:selected.photo_uri}} style={s.detailAvatarImage}/> : <Text style={s.bigAvatarText}>{initials(selected)}</Text>}</View><Text style={s.detailName}>{selected.first_name} {selected.last_name}</Text><Text style={s.detailSub}>{selected.job_title}{selected.job_title&&selected.company?' · ':''}{selected.company}</Text>
          <View style={s.actions}><Action styles={s} icon="call" label="Call" onPress={()=>call(selected)}/><Action styles={s} icon="chatbubble" label="Message" onPress={()=>sms(selected)}/><Action styles={s} icon="mail" label="Email" onPress={()=>email(selected)}/></View>
          {[['call-outline','Phone',selected.phone],['mail-outline','Email',selected.email],['business-outline','Company',selected.company],['briefcase-outline','Job title',selected.job_title],['location-outline','Address',selected.address],['people-outline','Group',selected.group_name],['document-text-outline','Notes',selected.notes]].filter(x=>x[2]).map(([icon,label,value])=><View key={label} style={s.detailField}><Ionicons name={icon} size={19} color={C.blue}/><View style={{flex:1}}><Text style={s.detailLabel}>{label}</Text><Text style={s.detailValue}>{value}</Text></View></View>)}
          <View style={s.detailButtons}><Pressable style={s.secondaryButton} onPress={()=>{const c=selected;setModal('form');openEdit(c);}}><Ionicons name="create-outline" size={18} color={C.blue}/><Text style={s.secondaryText}>Edit</Text></Pressable><Pressable style={s.secondaryButton} onPress={()=>toggleFavorite(selected)}><Ionicons name={selected.favorite?'heart':'heart-outline'} size={18} color="#EF476F"/><Text style={s.secondaryText}>{selected.favorite?'Unfavorite':'Favorite'}</Text></Pressable><Pressable style={s.secondaryButton} onPress={()=>confirmDelete(selected)}><Ionicons name="trash-outline" size={18} color={C.red}/><Text style={[s.secondaryText,{color:C.red}]}>Delete</Text></Pressable></View>
        </ScrollView>}
      </View></View>
    </Modal>
  </SafeAreaView>;
}

const createStyles = C => StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg}, header:{paddingHorizontal:22,paddingTop:12,paddingBottom:17,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, eyebrow:{fontSize:10,fontWeight:'800',letterSpacing:1.5,color:C.blue,marginBottom:5}, title:{fontSize:27,fontWeight:'800',color:C.ink}, headerAdd:{width:44,height:44,borderRadius:15,backgroundColor:C.blue,alignItems:'center',justifyContent:'center',elevation:3},
  searchBox:{marginHorizontal:20,marginBottom:13,backgroundColor:C.white,borderRadius:14,paddingHorizontal:14,height:49,flexDirection:'row',alignItems:'center',gap:9,borderWidth:1,borderColor:C.line},searchInput:{flex:1,fontSize:14,color:C.ink},quickFilters:{flexDirection:'row',paddingHorizontal:20,gap:8,marginBottom:12},chip:{paddingHorizontal:14,paddingVertical:8,borderRadius:22,backgroundColor:C.white,borderWidth:1,borderColor:C.line},chipActive:{backgroundColor:C.pale,borderColor:'#BFDBFE'},chipText:{fontSize:12,color:C.muted,fontWeight:'600'},chipTextActive:{color:C.blue},
  summary:{marginHorizontal:20,marginBottom:13,backgroundColor:C.white,borderRadius:18,padding:17,flexDirection:'row',alignItems:'center',gap:18,borderWidth:1,borderColor:C.line},summaryNumber:{fontSize:24,fontWeight:'800',color:C.ink},summaryLabel:{fontSize:11,color:C.muted,marginTop:2},summaryDivider:{width:1,height:35,backgroundColor:C.line},summaryIcon:{marginLeft:'auto',width:48,height:48,borderRadius:15,backgroundColor:C.pale,alignItems:'center',justifyContent:'center'},
  sectionLabel:{fontSize:10,fontWeight:'800',letterSpacing:1.1,color:C.muted,marginTop:8,marginBottom:10},contactRow:{backgroundColor:C.white,borderRadius:15,padding:13,marginBottom:9,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:C.line},avatar:{width:44,height:44,borderRadius:15,backgroundColor:C.pale,alignItems:'center',justifyContent:'center',marginRight:12,overflow:'hidden'},avatarImage:{width:'100%',height:'100%'},avatarText:{fontSize:15,fontWeight:'800',color:C.blue},contactName:{fontSize:14,fontWeight:'700',color:C.ink},contactSub:{fontSize:12,color:C.muted,marginTop:4},empty:{alignItems:'center',paddingTop:70,gap:10},emptyTitle:{fontSize:18,fontWeight:'800',color:C.ink},emptyText:{fontSize:13,color:C.muted,marginBottom:8},
  tabBar:{position:'absolute',bottom:0,left:0,right:0,backgroundColor:C.white,borderTopWidth:1,borderColor:C.line,paddingTop:10,paddingBottom:Platform.OS==='ios'?22:10,flexDirection:'row',justifyContent:'space-around'},tabItem:{alignItems:'center',gap:4,minWidth:55},tabLabel:{fontSize:10,color:'#929AAA'},
  page:{paddingHorizontal:20,paddingBottom:110},helper:{fontSize:13,color:C.muted,lineHeight:20,marginBottom:16},groupCreate:{flexDirection:'row',gap:9,alignItems:'center',marginBottom:18},input:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:12,paddingHorizontal:13,paddingVertical:12,fontSize:14,color:C.ink,marginBottom:13},addGroup:{width:47,height:47,borderRadius:13,backgroundColor:C.blue,alignItems:'center',justifyContent:'center'},groupRow:{backgroundColor:C.white,borderRadius:15,padding:14,marginBottom:9,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:C.line},groupIcon:{width:42,height:42,borderRadius:13,backgroundColor:C.pale,alignItems:'center',justifyContent:'center',marginRight:12},
  settingCard:{backgroundColor:C.white,borderRadius:16,borderWidth:1,borderColor:C.line,padding:15,marginBottom:23},action:{alignItems:'center',justifyContent:'center',minWidth:72,gap:6,padding:5},actionIcon:{width:43,height:43,borderRadius:14,alignItems:'center',justifyContent:'center'},actionText:{fontSize:11,fontWeight:'600',color:C.ink},divider:{height:1,backgroundColor:C.line,marginVertical:12},aboutTitle:{fontSize:16,fontWeight:'800',color:C.ink,marginBottom:7},version:{fontSize:11,color:C.muted,marginTop:12},
  modalSafe:{flex:1,backgroundColor:C.bg},modalHeader:{height:55,paddingHorizontal:20,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderColor:C.line},modalTitle:{fontSize:17,fontWeight:'800',color:C.ink},formPage:{padding:20,paddingBottom:45},bigAvatar:{width:76,height:76,borderRadius:25,backgroundColor:'#DBEAFE',alignItems:'center',justifyContent:'center',alignSelf:'center',marginBottom:22},bigAvatarText:{fontSize:25,fontWeight:'800',color:C.blue},field:{marginBottom:2},label:{fontSize:12,fontWeight:'700',color:'#475569',marginBottom:7},favoriteToggle:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:15,marginBottom:12},primaryButton:{height:50,borderRadius:14,backgroundColor:C.blue,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:9,marginTop:8},primaryText:{fontSize:14,fontWeight:'800',color:'white'},
  overlay:{flex:1,backgroundColor:'rgba(15,23,42,0.35)',justifyContent:'flex-end'},detailSheet:{backgroundColor:C.white,borderTopLeftRadius:25,borderTopRightRadius:25,maxHeight:'91%',paddingHorizontal:22,paddingTop:12},sheetHandle:{width:42,height:4,borderRadius:4,backgroundColor:'#D5DAE3',alignSelf:'center',marginBottom:10},closeDetail:{position:'absolute',right:20,top:18,zIndex:2,padding:5},detailAvatar:{width:82,height:82,borderRadius:27,backgroundColor:'#DBEAFE',alignItems:'center',justifyContent:'center',alignSelf:'center',marginTop:14},detailName:{fontSize:23,fontWeight:'800',color:C.ink,textAlign:'center',marginTop:12},detailSub:{fontSize:12,color:C.muted,textAlign:'center',marginTop:5},actions:{flexDirection:'row',justifyContent:'center',gap:27,marginVertical:20},detailField:{flexDirection:'row',alignItems:'flex-start',gap:13,paddingVertical:12,borderTopWidth:1,borderColor:C.line},detailLabel:{fontSize:10,color:C.muted,marginBottom:4},detailValue:{fontSize:14,color:C.ink,fontWeight:'600'},detailButtons:{flexDirection:'row',gap:8,marginTop:15},restoreButton:{flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:9,paddingVertical:8,backgroundColor:C.pale,borderRadius:10},restoreText:{fontSize:11,fontWeight:'700',color:C.blue},secondaryButton:{flex:1,borderWidth:1,borderColor:C.line,borderRadius:12,paddingVertical:12,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:5},secondaryText:{fontSize:12,fontWeight:'700',color:C.blue}
});
