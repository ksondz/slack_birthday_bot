#!/bin/bash

yel='\e[1;33m'
NC='\e[0m'
COUNT=0
name='slack-birthday-bot'

echo -e "${yel}This is a script to run slack bot server.\n${NC}"

echo -e "${yel}1 Use right node version \n${NC}"
nvm use

echo -e "${yel}2 Delete previous process \n${NC}"
pm2 delete ${name}

echo -e "${yel}3 Start new slack birthday bot process \n${NC}"
pm2 start index.js --name ${name}