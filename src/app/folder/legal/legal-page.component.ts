import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

type LegalDocumentType = 'privacy' | 'terms';

@Component({
  selector: 'app-legal-page',
  templateUrl: './legal-page.component.html',
  styleUrls: ['./legal-page.component.scss'],
})
export class LegalPageComponent implements OnInit {
  documentType: LegalDocumentType = 'privacy';

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.route.data.subscribe((data) => {
      this.documentType = data.documentType === 'terms' ? 'terms' : 'privacy';
    });
  }

  get isPrivacy(): boolean {
    return this.documentType === 'privacy';
  }
}
